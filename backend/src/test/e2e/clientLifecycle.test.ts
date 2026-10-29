/**
 * End-to-end client lifecycle over HTTP — the release gate's flow test.
 * Real routes, validation, state machine and Mongo (disposable); Stripe,
 * Groq and Resend are mocked; Stripe webhooks are genuinely signed.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import Stripe from "stripe";
import app from "../../app";
import TaskRequest from "../../models/TaskRequest";
import Proposal from "../../models/Proposal";
import Contract from "../../models/Contract";
import Payment from "../../models/Payment";
import ProjectTracker from "../../models/ProjectTracker";
import * as groq from "../../services/groq";
import { resendAdapter } from "../../integrations/resend/resend.adapter";
import { stripeAdapter } from "../../integrations/stripe/stripe.adapter";
import { connectTestDb, disconnectTestDb } from "../helpers/db";
import { staffToken } from "../helpers/auth";

const WEBHOOK_SECRET = "whsec_e2e_lifecycle";
const stripe = new Stripe("sk_test_dummy");
const mail: Array<{ to: string[]; subject: string; html: string }> = [];
let sessions = 0;
let admin: Record<string, string>;
let viewer: Record<string, string>;
let ip = 0;
const asClient = (req: request.Test) => req.set("X-Forwarded-For", `198.18.0.${++ip % 250}`);

function signedWebhook(event: object) {
  const payload = JSON.stringify(event);
  return request(app)
    .post("/v1/payments/webhook")
    .set("Content-Type", "application/json")
    .set("stripe-signature", stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET }))
    .send(payload);
}

beforeAll(async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  await connectTestDb();
  admin = { Authorization: `Bearer ${await staffToken("admin")}` };
  viewer = { Authorization: `Bearer ${await staffToken("viewer")}` };
}, 120000);

beforeEach(() => {
  vi.spyOn(resendAdapter, "emails", "get").mockReturnValue({
    send: async (msg: (typeof mail)[number]) => {
      mail.push(msg);
      return { data: { id: "m" }, error: null };
    },
  });
  vi.spyOn(groq, "generateContractWithAI").mockResolvedValue("<p>Service agreement</p>");
  vi.spyOn(stripeAdapter, "createCheckoutSession").mockImplementation(async () => {
    const id = `cs_e2e_${++sessions}`;
    return { id, url: `https://checkout.stripe.test/${id}` };
  });
  vi.spyOn(stripeAdapter, "retrieveCheckoutSession").mockImplementation(async (id) => ({ id, url: `https://checkout.stripe.test/${id}`, status: "open" }));
  vi.spyOn(stripeAdapter, "expireCheckoutSession").mockResolvedValue();
  vi.spyOn(stripeAdapter, "getReceiptUrl").mockResolvedValue("https://pay.stripe.test/receipt/1");
});

afterAll(async () => {
  vi.restoreAllMocks();
  await disconnectTestDb();
});

describe("client lifecycle end to end", () => {
  it("request → proposal → changes → acceptance → contract → invoice → payment → completion", async () => {
    // 1. Client submits a project request and can track it
    const submit = await asClient(request(app).post("/v1/task-requests")).send({
      name: "Ada Lovelace", email: "ada@client.test", service: "AI Agents", projectTitle: "Support agent",
      description: "We need an AI support agent that answers customer email.", budget: "$5,000",
    });
    expect(submit.status).toBe(201);
    const trackingToken = submit.body.trackingToken ?? submit.body.task?.trackingToken;
    expect(trackingToken).toBeTruthy();
    const track = await request(app).get(`/v1/task-requests/track/${trackingToken}`);
    expect(track.status).toBe(200);
    expect(track.body.status).toBe("new");
    const task = await TaskRequest.findOne({ email: "ada@client.test" });
    const taskId = String(task!._id);

    // 2. Admin moves it to review; viewers can't; workflow fields can't be set directly
    expect((await request(app).put(`/v1/task-requests/${taskId}/status`).set(viewer).send({ status: "in_review" })).status).toBe(403);
    expect((await request(app).put(`/v1/task-requests/${taskId}/status`).set(admin).send({ status: "in_review" })).status).toBe(200);
    expect((await request(app).put(`/v1/task-requests/${taskId}`).set(admin).send({ status: "completed" })).status).toBe(400);
    expect((await TaskRequest.findById(taskId))!.status).toBe("in_review");

    // 3. Admin drafts a proposal in cents
    const created = await request(app).post("/v1/proposals").set(admin).send({
      taskRequestId: taskId, title: "Support agent build", clientEmail: "ada@client.test", clientName: "Ada Lovelace",
      totalAmount: 150_000, milestones: [{ title: "Discovery", amount: 100_000, dueWeek: 2 }, { title: "Launch", amount: 50_000, dueWeek: 6 }],
      expiresInDays: 7,
    });
    expect(created.status).toBe(201);
    const proposalId = created.body._id;
    const proposalToken = created.body.proposalToken;
    expect((await Proposal.findById(proposalId))!.milestones[1].order).toBe(1);

    // 4. Sending emails the client a link with the formatted total
    mail.length = 0;
    expect((await request(app).post(`/v1/proposals/${proposalId}/send`).set(admin)).status).toBe(200);
    expect((await TaskRequest.findById(taskId))!.status).toBe("proposal_sent");
    expect(mail.some((m) => m.to.includes("ada@client.test") && m.html.includes(`/proposal/${proposalToken}`))).toBe(true);
    expect((await request(app).post(`/v1/proposals/${proposalId}/send`).set(admin)).status).toBe(409);

    // 5. The client view hides internal request data
    const view = await request(app).get(`/v1/proposals/view/${proposalToken}`);
    expect(view.status).toBe(200);
    expect(view.body.taskRequestId.statusHistory).toBeUndefined();
    expect((await request(app).get("/v1/proposals/view/does-not-exist")).status).toBe(404);

    // 6. Client asks for changes → back to review, admin notified with the note
    mail.length = 0;
    const changes = await request(app).post(`/v1/proposals/request-changes/${proposalToken}`).send({ clientNote: "Please lower the launch price." });
    expect(changes.status).toBe(200);
    expect((await Proposal.findById(proposalId))!.clientNote).toBe("Please lower the launch price.");
    expect((await TaskRequest.findById(taskId))!.status).toBe("in_review");
    expect(mail.some((m) => m.html.includes("Please lower the launch price."))).toBe(true);

    // 7. Re-send; two concurrent accepts create exactly one contract
    expect((await request(app).post(`/v1/proposals/${proposalId}/send`).set(admin)).status).toBe(200);
    const accepts = await Promise.all([
      request(app).post(`/v1/proposals/accept/${proposalToken}`),
      request(app).post(`/v1/proposals/accept/${proposalToken}`),
    ]);
    const ok = accepts.filter((r) => r.status === 200);
    expect(ok.length).toBeGreaterThanOrEqual(1);
    expect(accepts.every((r) => r.status === 200 || r.status === 409)).toBe(true);
    const contractToken = ok[0].body.contractToken;
    expect(contractToken).toMatch(/^contract_/);
    expect(await Contract.countDocuments({ proposalId })).toBe(1);
    expect((await TaskRequest.findById(taskId))!.status).toBe("contract_sent");

    // 9. Signing requires agreement; then creates the tracker; re-signing is refused
    expect((await request(app).get(`/v1/contracts/${contractToken}`)).status).toBe(200);
    const noAgree = await request(app).post(`/v1/contracts/${contractToken}/sign`).send({ clientSignatureName: "Ada Lovelace" });
    expect(noAgree.status).toBe(400);
    expect(noAgree.body.details[0].field).toBe("agreed");
    const sign = await request(app).post(`/v1/contracts/${contractToken}/sign`).send({ clientSignatureName: "Ada Lovelace", agreed: true });
    expect(sign.status).toBe(200);
    expect(sign.body.contract.status).toBe("signed");
    expect((await TaskRequest.findById(taskId))!.status).toBe("contract_signed");
    expect((await request(app).post(`/v1/contracts/${contractToken}/sign`).send({ clientSignatureName: "Ada Lovelace", agreed: true })).status).toBe(409);

    // 10. Tracker built from the proposal
    const tracker = await ProjectTracker.findOne({ taskRequestId: taskId });
    expect(tracker!.trackerToken).toBe(sign.body.trackerToken);
    expect(tracker!.currentPhase).toBe("Discovery");
    expect(tracker!.milestones.map((m) => m.amount)).toEqual([100_000, 50_000]);

    // 11. Invoice in cents
    const invoice = await request(app).post("/v1/payments/admin/invoice").set(admin).send({ taskRequestId: taskId, amountCents: 100_000, description: "Discovery deposit" });
    expect(invoice.status).toBe(201);
    expect(invoice.body.payment.amount).toBe(100_000);
    const invoiceToken = invoice.body.payment.invoiceToken;
    expect(invoice.body.invoiceUrl).toMatch(new RegExp(`/invoice/${invoiceToken}$`));

    // 12. Client view hides Stripe ids; two checkouts reuse one session
    const invoiceView = await request(app).get(`/v1/payments/invoice/${invoiceToken}`);
    expect(invoiceView.body).not.toHaveProperty("stripePaymentIntentId");
    const [c1, c2] = [await request(app).post(`/v1/payments/invoice/${invoiceToken}/checkout`), await request(app).post(`/v1/payments/invoice/${invoiceToken}/checkout`)];
    expect(c1.body.checkoutUrl).toBe(c2.body.checkoutUrl);
    expect(stripeAdapter.createCheckoutSession).toHaveBeenCalledTimes(1);
    const sessionId = (await Payment.findOne({ invoiceToken }))!.stripeSessionId;

    // 13. Signed webhook records the payment and starts the project; a replay changes nothing
    const event = {
      id: "evt_e2e_1", object: "event", type: "checkout.session.completed",
      data: { object: { id: sessionId, payment_status: "paid", payment_intent: "pi_e2e_1", metadata: { invoiceToken } } },
    };
    expect((await signedWebhook(event)).status).toBe(200);
    const paid = await Payment.findOne({ invoiceToken });
    expect(paid!.status).toBe("paid");
    expect(paid!.paidAt).toBeTruthy();
    expect(paid!.stripePaymentIntentId).toBe("pi_e2e_1");
    expect((await TaskRequest.findById(taskId))!.status).toBe("in_progress");
    mail.length = 0;
    expect((await signedWebhook(event)).status).toBe(200);
    expect((await TaskRequest.findById(taskId))!.statusHistory.filter((h) => h.status === "in_progress")).toHaveLength(1);
    expect(mail).toHaveLength(0);

    // 16. Sign-off: refused while milestones are unpaid; one completion under concurrent approvals
    const trackerAdmin = `/v1/tracker/admin/${tracker!._id}`;
    expect((await request(app).post(`${trackerAdmin}/completion/request`).set(admin)).status).toBe(400);
    await ProjectTracker.updateOne(
      { _id: tracker!._id },
      { $set: { "milestones.$[].paidAt": new Date(), currentPhase: "Delivery", deliverables: [] } }
    );
    expect((await request(app).post(`${trackerAdmin}/completion/request`).set(admin)).status).toBe(200);
    const approvals = await Promise.all([
      request(app).post(`/v1/tracker/client/${tracker!.trackerToken}/completion/approve`),
      request(app).post(`/v1/tracker/client/${tracker!.trackerToken}/completion/approve`),
    ]);
    expect(approvals.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await TaskRequest.findById(taskId))!.status).toBe("completed");
  });

  it("8. expired proposals and cancelled requests can't be accepted", async () => {
    const cancelled = await TaskRequest.create({ name: "Bo", email: "bo@client.test", service: "AI", description: "A long enough description.", status: "cancelled" });
    const p = await Proposal.create({
      proposalToken: "prop_e2e_cancelled", taskRequestId: cancelled._id, clientEmail: "bo@client.test", title: "X", totalAmount: 100_00,
      milestones: [{ title: "All", amount: 100_00 }], status: "sent", expiresAt: new Date(Date.now() + 86_400_000),
    });
    expect((await request(app).post(`/v1/proposals/accept/${p.proposalToken}`)).status).toBe(409);
    await Proposal.updateOne({ _id: p._id }, { expiresAt: new Date(Date.now() - 1000) });
    expect((await request(app).post(`/v1/proposals/accept/${p.proposalToken}`)).status).toBe(410);
    expect(await Contract.countDocuments({ proposalId: p._id })).toBe(0);
  });

  it("11b. no invoice before the contract is signed", async () => {
    const early = await TaskRequest.create({ name: "Cy", email: "cy@client.test", service: "AI", description: "A long enough description.", status: "proposal_sent" });
    const res = await request(app).post("/v1/payments/admin/invoice").set(admin).send({ taskRequestId: String(early._id), amountCents: 100_000, description: "Too early" });
    expect(res.status).toBe(409);
  });

  // Enabled by Phase 4 (PRODUCTION_PLAN.md T-LC-5 / T-LC-6)
  it("14. a milestone checkout webhook marks the tracker milestone paid and records a Payment", async () => {
    const task = await TaskRequest.create({ name: "Di", email: "di@client.test", service: "AI", description: "A long enough description.", status: "in_progress", trackingToken: "trk_di" });
    const tracker = await ProjectTracker.create({
      taskRequestId: task._id, proposalId: task._id, trackerToken: "trk-milestone-e2e",
      milestones: [{ title: "Phase 2", amount: 75_000, dueDate: new Date() }],
    });
    const mId = String(tracker.milestones[0]._id);

    expect((await request(app).post(`/v1/tracker/client/${tracker.trackerToken}/milestone/${mId}/checkout`)).status).toBe(409); // not requested yet
    expect((await request(app).post(`/v1/tracker/admin/${tracker._id}/milestone/${mId}/mark-payable`).set(admin)).status).toBe(200);
    const checkout = await request(app).post(`/v1/tracker/client/${tracker.trackerToken}/milestone/${mId}/checkout`);
    expect(checkout.body.checkoutUrl).toMatch(/^https:\/\/checkout\.stripe\.test\//);
    const again = await request(app).post(`/v1/tracker/client/${tracker.trackerToken}/milestone/${mId}/checkout`);
    expect(again.body.checkoutUrl).toBe(checkout.body.checkoutUrl);

    const payment = await Payment.findOne({ trackerId: tracker._id, milestoneId: mId });
    expect(payment).toMatchObject({ type: "milestone", amount: 75_000, status: "pending" });
    const event = { id: "evt_milestone_1", type: "checkout.session.completed", data: { object: { id: payment!.stripeSessionId, payment_status: "paid", payment_intent: "pi_ms_1", metadata: { invoiceToken: payment!.invoiceToken } } } };
    expect((await signedWebhook(event)).status).toBe(200);
    expect((await signedWebhook(event)).status).toBe(200);

    const paidTracker = await ProjectTracker.findById(tracker._id);
    expect(paidTracker!.milestones[0].paidAt).toBeTruthy();
    expect(String(paidTracker!.milestones[0].invoiceId)).toBe(String(payment!._id));
    expect(await Payment.countDocuments({ type: "milestone", milestoneId: mId })).toBe(1);
    expect((await request(app).post(`/v1/tracker/client/${tracker.trackerToken}/milestone/${mId}/checkout`)).body.alreadyPaid).toBe(true);
  });

  it("15. if post-payment work fails, the payment stays recorded and the work is retried until done", async () => {
    const task = await TaskRequest.create({ name: "Ed", email: "ed@client.test", service: "AI", description: "A long enough description.", status: "contract_signed", trackingToken: "trk_ed" });
    const payment = await Payment.create({
      invoiceToken: "inv_retry", taskRequestId: task._id, clientEmail: "ed@client.test", description: "Deposit",
      amount: 50_000, type: "invoice", status: "pending", stripeSessionId: "cs_retry",
    });
    const event = { id: "evt_retry_1", type: "checkout.session.completed", data: { object: { id: "cs_retry", payment_status: "paid", payment_intent: "pi_retry", metadata: { invoiceToken: "inv_retry" } } } };

    vi.spyOn(resendAdapter, "emails", "get").mockReturnValue({ send: async () => { throw new Error("mail down"); } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { paymentService } = await import("../../modules/payments/payment.service");
    const original = paymentService.runPaidSideEffects.bind(paymentService);
    const failing = vi.spyOn(paymentService, "runPaidSideEffects").mockRejectedValueOnce(new Error("transient failure"));

    expect((await signedWebhook(event)).status).toBe(500); // Stripe will retry
    const stuck = await Payment.findById(payment._id);
    expect(stuck).toMatchObject({ status: "paid", sideEffectsDone: false });

    failing.mockImplementation(original);
    expect((await signedWebhook(event)).status).toBe(200); // Stripe's retry finishes the work
    expect((await Payment.findById(payment._id))!.sideEffectsDone).toBe(true);
    expect((await TaskRequest.findById(task._id))!.status).toBe("in_progress");
  });

  it("15b. the reconciler finishes post-payment work Stripe never retried", async () => {
    const task = await TaskRequest.create({ name: "Fa", email: "fa@client.test", service: "AI", description: "A long enough description.", status: "contract_signed" });
    await Payment.create({
      invoiceToken: "inv_recon", taskRequestId: task._id, clientEmail: "fa@client.test", description: "Deposit", amount: 50_000,
      type: "invoice", status: "paid", paidAt: new Date(Date.now() - 10 * 60_000), sideEffectsDone: false,
    });
    const { paymentService } = await import("../../modules/payments/payment.service");
    expect(await paymentService.reconcilePaidPayments()).toBe(1);
    expect((await TaskRequest.findById(task._id))!.status).toBe("in_progress");
    expect(await paymentService.reconcilePaidPayments()).toBe(0);
  });
  it.todo("17. cancelling an engagement cascades to proposal, contract and open invoices");
});
