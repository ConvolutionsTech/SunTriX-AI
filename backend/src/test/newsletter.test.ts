import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import app from "../app";
import Newsletter from "../models/Newsletter";
import Campaign from "../models/Campaign";
import * as email from "../services/email";
import { resendAdapter } from "../integrations/resend/resend.adapter";
import { updateSettingCache } from "../lib/configLoader";
import { connectTestDb, clearTestDb, disconnectTestDb } from "./helpers/db";
import { staffToken } from "./helpers/auth";

let ip = 0;
const subscribe = (body: object) =>
  request(app).post("/v1/newsletter").set("X-Forwarded-For", `192.0.2.${++ip % 250}`).send(body);
const ada = { name: "Ada", email: "ada@reader.test", interest: "AI" };

describe("newsletter subscription (M25, N-OPA-1)", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120000);

  afterEach(async () => {
    vi.restoreAllMocks();
    updateSettingCache("NEWSLETTER_DOUBLE_OPTIN", "");
    await clearTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it("double opt-in: subscribe → confirm link → subscribed, welcome sent", async () => {
    updateSettingCache("NEWSLETTER_DOUBLE_OPTIN", "true");
    const confirm = vi.spyOn(email, "sendNewsletterConfirmationEmail").mockResolvedValue();
    const welcome = vi.spyOn(email, "sendNewsletterWelcomeEmail").mockResolvedValue();

    expect((await subscribe(ada)).body.requiresConfirmation).toBe(true);
    expect((await Newsletter.findOne({ email: ada.email }))?.subscribed).toBe(false);

    const url = confirm.mock.calls[0][0].confirmUrl;
    expect(url).toMatch(/\/newsletter\/confirm\/[a-f0-9]{64}$/);
    const res = await request(app).get(`/v1/newsletter/confirm/${url.split("/").pop()}`);
    expect(res.status).toBe(200);
    expect((await Newsletter.findOne({ email: ada.email }))?.subscribed).toBe(true);
    expect(welcome).toHaveBeenCalledTimes(1);
  });

  it("re-submitting an unconfirmed address never subscribes it — it re-sends the confirmation", async () => {
    updateSettingCache("NEWSLETTER_DOUBLE_OPTIN", "true");
    const confirm = vi.spyOn(email, "sendNewsletterConfirmationEmail").mockResolvedValue();

    await subscribe(ada);
    await subscribe(ada);
    expect((await Newsletter.findOne({ email: ada.email }))?.subscribed).toBe(false);
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it("responds the same whether or not the address is already subscribed", async () => {
    updateSettingCache("NEWSLETTER_DOUBLE_OPTIN", "true");
    vi.spyOn(email, "sendNewsletterConfirmationEmail").mockResolvedValue();
    await Newsletter.create({ ...ada, subscribed: true });

    const known = await subscribe(ada);
    const fresh = await subscribe({ ...ada, email: "new@reader.test" });
    expect(known.status).toBe(fresh.status);
    expect(known.body).toEqual(fresh.body);
  });

  it("unsubscribe link works without login and only for a valid token", async () => {
    const sub = await Newsletter.create({ ...ada, subscribed: true });
    expect(sub.unsubscribeToken).toMatch(/^[\w-]{40,}$/);

    expect((await request(app).post("/v1/newsletter/unsubscribe/not-a-token")).status).toBe(404);
    expect((await request(app).post(`/v1/newsletter/unsubscribe/${sub.unsubscribeToken}`)).status).toBe(200);
    expect((await Newsletter.findById(sub._id))?.subscribed).toBe(false);
  });
});

describe("campaign sending", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120000);

  afterEach(async () => {
    vi.restoreAllMocks();
    await clearTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it("gives every recipient their own unsubscribe link and List-Unsubscribe header (incl. old subscribers)", async () => {
    const sent: Array<{ to: string[]; html: string; headers: Record<string, string> }> = [];
    vi.spyOn(resendAdapter, "batch", "get").mockReturnValue({
      send: async (batch: typeof sent) => {
        sent.push(...batch);
        return { data: {}, error: null };
      },
    });
    await Newsletter.create({ ...ada, subscribed: true });
    // An older subscriber stored before unsubscribe tokens existed
    await Newsletter.collection.insertOne({ name: "Old", email: "old@reader.test", interest: "AI", subscribed: true });

    const res = await request(app)
      .post("/v1/newsletter/broadcast")
      .set("Authorization", `Bearer ${await staffToken("admin")}`)
      .send({ subject: "Hello", body: "<p>News</p>", targetAudience: "All" });
    expect(res.status).toBe(202);

    await vi.waitFor(() => expect(sent).toHaveLength(2));
    for (const msg of sent) {
      const token = (await Newsletter.findOne({ email: msg.to[0] }).lean())!.unsubscribeToken;
      expect(token).toBeTruthy();
      expect(msg.html).toContain(`/newsletter/unsubscribe/${token}`);
      expect(msg.headers["List-Unsubscribe"]).toContain(token);
    }
    await vi.waitFor(async () => expect((await Campaign.findOne())?.status).toBe("sent"));
  });

  it("rejects a broadcast without subject or body", async () => {
    const res = await request(app)
      .post("/v1/newsletter/broadcast")
      .set("Authorization", `Bearer ${await staffToken("admin")}`)
      .send({ subject: "" });
    expect(res.status).toBe(400);
  });

  it("retries a failed campaign to the subscribers it hasn't reached (A23)", async () => {
    const sent: string[] = [];
    vi.spyOn(resendAdapter, "batch", "get").mockReturnValue({
      send: async (batch: Array<{ to: string[] }>) => {
        sent.push(...batch.map((m) => m.to[0]));
        return { data: {}, error: null };
      },
    });
    for (const n of [1, 2, 3]) await Newsletter.create({ name: `R${n}`, email: `r${n}@reader.test`, interest: "AI", subscribed: true });
    const campaign = await Campaign.create({
      subject: "S", htmlBody: "<p>x</p>", targetAudience: "All", recipientCount: 3, sentCount: 1,
      adminId: "a", adminName: "A", status: "failed",
    });

    const res = await request(app)
      .post(`/v1/newsletter/admin/campaigns/${campaign._id}/retry`)
      .set("Authorization", `Bearer ${await staffToken("admin")}`);
    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(sent).toEqual(["r2@reader.test", "r3@reader.test"]));
    await vi.waitFor(async () => expect((await Campaign.findById(campaign._id))?.sentCount).toBe(3));
  });
});
