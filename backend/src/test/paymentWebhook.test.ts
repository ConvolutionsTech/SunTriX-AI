import { describe, it, expect, vi, beforeAll, beforeEach, afterAll, afterEach } from "vitest";
import request from "supertest";
import Stripe from "stripe";
import app from "../app";
import Payment from "../models/Payment";
import TaskRequest from "../models/TaskRequest";
import WebhookEvent from "../models/WebhookEvent";
import * as email from "../services/email";
import { stripeAdapter } from "../integrations/stripe/stripe.adapter";
import { connectTestDb, clearTestDb, disconnectTestDb } from "./helpers/db";

const SECRET = "whsec_webhook_suite";
const stripe = new Stripe("sk_test_dummy");
const send = (event: object, secret = SECRET) => {
  const payload = JSON.stringify(event);
  return request(app).post("/v1/payments/webhook").set("Content-Type", "application/json")
    .set("stripe-signature", stripe.webhooks.generateTestHeaderString({ payload, secret })).send(payload);
};

describe("Stripe webhook handling (A16, M27, M39, N-LC-4)", () => {
  beforeAll(async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    await connectTestDb();
  }, 120000);

  beforeEach(() => {
    vi.spyOn(stripeAdapter, "getReceiptUrl").mockResolvedValue("https://pay.stripe.test/receipt/9");
    vi.spyOn(email, "sendPaymentConfirmation").mockResolvedValue();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await clearTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  const seed = async () => {
    const task = await TaskRequest.create({ name: "Ada", email: "ada@client.test", service: "AI", description: "A long enough description.", status: "contract_signed" });
    return Payment.create({ invoiceToken: "inv_w", taskRequestId: task._id, clientEmail: "ada@client.test", description: "Deposit", amount: 1000, type: "invoice", status: "pending", stripeSessionId: "cs_w" });
  };
  const completed = (id: string, paymentStatus = "paid") => ({
    id, type: "checkout.session.completed",
    data: { object: { id: "cs_w", payment_status: paymentStatus, payment_intent: "pi_w", metadata: { invoiceToken: "inv_w" } } },
  });

  it("records the payment with its receipt, once, and logs the event", async () => {
    await seed();
    expect((await send(completed("evt_1"))).status).toBe(200);
    const res = await send(completed("evt_1"));
    expect(res.body.duplicate).toBe(true);
    const p = await Payment.findOne({ invoiceToken: "inv_w" });
    expect(p).toMatchObject({ status: "paid", stripePaymentIntentId: "pi_w", receiptUrl: "https://pay.stripe.test/receipt/9", sideEffectsDone: true });
    expect(email.sendPaymentConfirmation).toHaveBeenCalledTimes(1);
    expect((await WebhookEvent.findById("evt_1"))?.processedAt).toBeTruthy();
  });

  it("ignores a completed session whose payment hasn't cleared yet", async () => {
    await seed();
    expect((await send(completed("evt_2", "unpaid"))).status).toBe(200);
    expect((await Payment.findOne({ invoiceToken: "inv_w" }))?.status).toBe("pending");
  });

  it("rejects a bad signature with 400 and changes nothing", async () => {
    await seed();
    expect((await send(completed("evt_3"), "whsec_attacker")).status).toBe(400);
    expect((await Payment.findOne({ invoiceToken: "inv_w" }))?.status).toBe("pending");
  });

  it("records refunds and flags disputes for the admin", async () => {
    await seed();
    await send(completed("evt_4"));
    const alert = vi.spyOn(email, "sendAdminAlert").mockResolvedValue();

    await send({ id: "evt_5", type: "charge.dispute.created", data: { object: { payment_intent: "pi_w", amount: 1000, currency: "usd", reason: "fraudulent" } } });
    expect((await Payment.findOne({ invoiceToken: "inv_w" }))?.disputed).toBe(true);
    expect(alert).toHaveBeenCalledTimes(1);

    await send({ id: "evt_6", type: "charge.refunded", data: { object: { payment_intent: "pi_w", refunds: { data: [{ id: "re_1" }] } } } });
    expect(await Payment.findOne({ invoiceToken: "inv_w" })).toMatchObject({ status: "refunded", refundId: "re_1" });
  });

  it("raw-body detection ignores a query string on the webhook URL", async () => {
    await seed();
    const payload = JSON.stringify(completed("evt_7"));
    const res = await request(app).post("/v1/payments/webhook?source=stripe").set("Content-Type", "application/json")
      .set("stripe-signature", stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET })).send(payload);
    expect(res.status).toBe(200);
  });
});
