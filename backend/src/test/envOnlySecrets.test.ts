import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import Stripe from "stripe";
import app from "../app";
import SystemSetting from "../models/SystemSetting";
import { getSetting, updateSettingCache, isEnvOnlySetting } from "../lib/configLoader";

const ORIGINAL_ENV = { ...process.env };
const JWT_TEST_SECRET = "test_jwt_secret_for_env_only_suite_0123456789abcdef";
const WEBHOOK_SECRET = "whsec_test_env_only_suite";
const stripe = new Stripe("sk_test_dummy");

// An event type the webhook handler acknowledges without touching the DB
const payload = JSON.stringify({ id: "evt_test", object: "event", type: "payment_intent.created", data: { object: {} } });

function postWebhook(signedWith: string) {
  return request(app)
    .post("/v1/payments/webhook")
    .set("Content-Type", "application/json")
    .set("stripe-signature", stripe.webhooks.generateTestHeaderString({ payload, secret: signedWith }))
    .send(payload);
}

function adminToken() {
  return jwt.sign({ id: "admin_1", email: "admin@suntrix.com", role: "admin", name: "Admin" }, JWT_TEST_SECRET);
}

beforeEach(() => {
  process.env.JWT_SECRET = JWT_TEST_SECRET;
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
  delete process.env.STRIPE_WEBHOOK_SECRET;
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
  vi.restoreAllMocks();
});

describe("Stripe webhook fails closed (N-RUN-7)", () => {
  it("rejects an event forged with an empty secret when no secret is configured", async () => {
    const res = await postWebhook("");
    expect(res.status).toBe(500);
  });

  it("rejects when the configured secret is empty", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "";
    const res = await postWebhook("");
    expect(res.status).toBe(500);
  });

  it("rejects an event signed with the wrong secret", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    const res = await postWebhook("whsec_attacker");
    expect(res.status).toBe(400);
  });

  it("accepts an event signed with the configured secret", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    const res = await postWebhook(WEBHOOK_SECRET);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, eventType: "payment_intent.created" });
  });
});

describe("env-only settings", () => {
  it("classifies secrets and auth keys as env-only", () => {
    for (const key of ["JWT_SECRET", "JWT_EXPIRY", "STRIPE_WEBHOOK_SECRET", "RESEND_API_KEY", "CLOUDINARY_API_SECRET"]) {
      expect(isEnvOnlySetting(key)).toBe(true);
    }
    expect(isEnvOnlySetting("GROQ_CHAT_MODEL")).toBe(false);
  });

  it("reads env-only keys from the environment, never the runtime cache", () => {
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    expect(() => updateSettingCache("STRIPE_WEBHOOK_SECRET", "")).toThrow(/env-only/);
    expect(getSetting("STRIPE_WEBHOOK_SECRET")).toBe(WEBHOOK_SECRET);
  });

  it("PATCH /v1/settings/:key refuses env-only keys", async () => {
    const res = await request(app)
      .patch("/v1/settings/STRIPE_WEBHOOK_SECRET")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ value: "" });
    expect(res.status).toBe(403);
  });

  it("PATCH /v1/settings/bulk refuses env-only keys", async () => {
    const res = await request(app)
      .patch("/v1/settings/bulk")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ updates: [{ key: "JWT_SECRET", value: "attacker-chosen" }] });
    expect(res.status).toBe(400);
    expect(res.body.saved).toBe(0);
    expect(getSetting("JWT_SECRET")).toBe(JWT_TEST_SECRET);
  });

  it("GET /v1/settings never returns env-only rows, even masked", async () => {
    const rows = [
      { key: "STRIPE_SECRET_KEY", value: "sk_live_leak", section: "payments", isSecret: false },
      { key: "GROQ_CHAT_MODEL", value: "llama-3.1-8b-instant", section: "ai", isSecret: false },
    ];
    vi.spyOn(SystemSetting, "find").mockReturnValue({ lean: async () => rows } as any);

    const res = await request(app).get("/v1/settings").set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    const keys = res.body.settings.map((s: any) => s.key);
    expect(keys).toContain("GROQ_CHAT_MODEL");
    expect(keys).not.toContain("STRIPE_SECRET_KEY");
    expect(JSON.stringify(res.body)).not.toContain("sk_live_leak");
  });
});
