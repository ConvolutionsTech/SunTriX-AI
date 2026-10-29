import { describe, it, expect, vi, beforeAll, beforeEach, afterAll, afterEach } from "vitest";
import request from "supertest";
import app from "../app";
import TaskRequest from "../models/TaskRequest";
import Payment from "../models/Payment";
import * as email from "../services/email";
import { stripeAdapter } from "../integrations/stripe/stripe.adapter";
import { connectTestDb, clearTestDb, disconnectTestDb } from "./helpers/db";
import { staffToken } from "./helpers/auth";

const newTask = (status: string) =>
  TaskRequest.create({ name: "Ada", email: "ada@client.test", service: "AI", description: "A long enough description.", status, trackingToken: `trk_${status}_${Date.now()}` });
const createInvoice = async (taskRequestId: string, overrides: object = {}) =>
  request(app)
    .post("/v1/payments/admin/invoice")
    .set("Authorization", `Bearer ${await staffToken("admin")}`)
    .send({ taskRequestId, amountCents: 250_000, description: "Deposit", ...overrides });
const checkout = (token: string) => request(app).post(`/v1/payments/invoice/${token}/checkout`);

describe("invoices and checkout (A3, A17, N-LC-3)", () => {
  let created = 0;
  let sessions: Record<string, { status: string; url: string }> = {};

  beforeAll(async () => {
    await connectTestDb();
  }, 120000);

  beforeEach(() => {
    created = 0;
    sessions = {};
    vi.spyOn(email, "sendInvoiceEmail").mockResolvedValue();
    vi.spyOn(stripeAdapter, "createCheckoutSession").mockImplementation(async () => {
      const id = `cs_test_${++created}`;
      sessions[id] = { status: "open", url: `https://checkout.stripe.test/${id}` };
      return { id, url: sessions[id].url };
    });
    vi.spyOn(stripeAdapter, "retrieveCheckoutSession").mockImplementation(async (id) => ({ id, ...sessions[id] }));
    vi.spyOn(stripeAdapter, "expireCheckoutSession").mockImplementation(async (id) => {
      if (sessions[id]) sessions[id].status = "expired";
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await clearTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it("creates an invoice in cents for a signed engagement, defaulting the client details", async () => {
    const task = await newTask("contract_signed");
    const res = await createInvoice(String(task._id));
    expect(res.status).toBe(201);
    const payment = await Payment.findById(res.body.payment._id).lean();
    expect(payment).toMatchObject({ amount: 250_000, currency: "usd", clientEmail: "ada@client.test", trackingToken: task.trackingToken, status: "pending" });
  });

  it("refuses invoices before the contract is signed", async () => {
    for (const status of ["new", "proposal_sent", "contract_sent", "cancelled"]) {
      const task = await newTask(status);
      const res = await createInvoice(String(task._id));
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("TASK_NOT_INVOICEABLE");
    }
    expect(await Payment.countDocuments()).toBe(0);
  });

  it("rejects dollar-style amounts", async () => {
    const task = await newTask("contract_signed");
    expect((await createInvoice(String(task._id), { amountCents: 2500.5 })).status).toBe(400);
  });

  it("two tabs get the same open checkout session — never two", async () => {
    const task = await newTask("contract_signed");
    const token = (await createInvoice(String(task._id))).body.payment.invoiceToken;

    const first = await checkout(token);
    const [a, b] = await Promise.all([checkout(token), checkout(token)]);
    expect(first.body.checkoutUrl).toBe("https://checkout.stripe.test/cs_test_1");
    expect([a.body.checkoutUrl, b.body.checkoutUrl]).toEqual([first.body.checkoutUrl, first.body.checkoutUrl]);
    expect(created).toBe(1);
  });

  it("concurrent first checkouts create one session (the other is asked to retry)", async () => {
    const task = await newTask("contract_signed");
    const token = (await createInvoice(String(task._id))).body.payment.invoiceToken;
    const results = await Promise.all([checkout(token), checkout(token), checkout(token)]);
    expect(created).toBe(1);
    expect(results.filter((r) => r.status === 200).length).toBeGreaterThanOrEqual(1);
    expect(results.every((r) => r.status === 200 || r.status === 409)).toBe(true);
  });

  it("an expired session is replaced and the old one expired", async () => {
    const task = await newTask("contract_signed");
    const token = (await createInvoice(String(task._id))).body.payment.invoiceToken;
    await checkout(token);
    sessions.cs_test_1.status = "expired";

    const res = await checkout(token);
    expect(res.body.checkoutUrl).toBe("https://checkout.stripe.test/cs_test_2");
    expect((await Payment.findOne({ invoiceToken: token }))?.stripeSessionId).toBe("cs_test_2");
  });

  it("paid, cancelled or expired invoices can't be paid", async () => {
    const task = await newTask("contract_signed");
    const token = (await createInvoice(String(task._id))).body.payment.invoiceToken;

    await Payment.updateOne({ invoiceToken: token }, { status: "cancelled" });
    expect((await checkout(token)).status).toBe(409);
    await Payment.updateOne({ invoiceToken: token }, { status: "paid" });
    expect((await checkout(token)).status).toBe(409);
    await Payment.updateOne({ invoiceToken: token }, { status: "pending", expiresAt: new Date(Date.now() - 1000) });
    expect((await checkout(token)).status).toBe(410);
    expect(created).toBe(0);
  });
});
