import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import request from "supertest";
import app from "../app";
import * as email from "../services/email";
import ContactMessage from "../models/ContactMessage";
import { connectTestDb, disconnectTestDb } from "./helpers/db";
import { staffToken } from "./helpers/auth";

// Each test uses its own client IP so limiter buckets don't leak between tests (TRUST_PROXY=1 in setup)
let ipCounter = 0;
const nextIp = () => `10.77.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`;

const contact = (ip: string) =>
  request(app).post("/v1/contact").set("X-Forwarded-For", ip).send({ name: "Ada", email: "ada@client.test", subject: "Hello", message: "A message that is long enough." });

describe("rate limits are scoped per route (T-BR-8)", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120000);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it("the 6th anonymous contact submission in an hour from one IP is refused", async () => {
    vi.spyOn(email, "sendContactNotification").mockResolvedValue();
    const ip = nextIp();
    for (let i = 0; i < 5; i++) expect((await contact(ip)).status).toBe(201);
    const blocked = await contact(ip);
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe("RATE_LIMITED");
  });

  it("each public form has its own budget", async () => {
    vi.spyOn(email, "sendContactNotification").mockResolvedValue();
    vi.spyOn(email, "sendNewsletterConfirmationEmail").mockResolvedValue();
    const ip = nextIp();
    for (let i = 0; i < 5; i++) await contact(ip);
    const subscribe = await request(app).post("/v1/newsletter").set("X-Forwarded-For", ip).send({ email: "new@reader.test" });
    expect(subscribe.status).not.toBe(429);
  });

  it("admin replies are not throttled by the public form limit", async () => {
    vi.spyOn(email, "sendDirectReply").mockResolvedValue({ success: true } as never);
    const ip = nextIp();
    const auth = { Authorization: `Bearer ${await staffToken("admin")}` };
    const msg = await ContactMessage.create({ name: "Ada", email: "ada@client.test", subject: "Hello", message: "A message that is long enough." });
    for (let i = 0; i < 6; i++) {
      const res = await request(app).post("/v1/contact/reply").set("X-Forwarded-For", ip).set(auth).send({ messageId: String(msg._id), subject: "Re: Hello", body: "Thanks for reaching out." });
      expect(res.status).toBe(200);
    }
  });

  it("the Stripe webhook is never rate limited", async () => {
    vi.stubEnv("RATE_LIMIT_MAX", "50");
    const ip = nextIp();
    for (let i = 0; i < 60; i++) {
      const res = await request(app).post("/v1/payments/webhook").set("X-Forwarded-For", ip).set("Content-Type", "application/json").send("{}");
      expect(res.status).not.toBe(429);
    }
    vi.unstubAllEnvs();
  });
});
