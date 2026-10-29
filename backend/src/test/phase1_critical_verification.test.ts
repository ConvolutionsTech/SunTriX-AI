import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import Stripe from "stripe";
import app from "../app";
import TaskRequest from "../models/TaskRequest";
import Proposal from "../models/Proposal";
import Contract from "../models/Contract";
import ProjectTracker from "../models/ProjectTracker";
import Payment from "../models/Payment";
import * as emailService from "../services/email";
import * as groqService from "../services/groq";
import { connectTestDb, clearTestDb, disconnectTestDb } from "./helpers/db";

const WEBHOOK_SECRET = "whsec_test_phase1_critical";
const stripe = new Stripe("sk_test_dummy");

// Sends a genuinely signed webhook — signature verification runs for real
function postSignedWebhook(event: object) {
  const payload = JSON.stringify(event);
  return request(app)
    .post("/v1/payments/webhook")
    .set("Content-Type", "application/json")
    .set("stripe-signature", stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET }))
    .send(payload);
}

describe("Phase 1 Critical Verification Gate", () => {
  beforeAll(async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    await connectTestDb();
  }, 120000);

  afterEach(async () => {
    vi.restoreAllMocks();
    await clearTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  describe("A. Proposal Acceptance Race & Error Handling", () => {
    it("should handle 2 concurrent acceptance requests safely with exactly 1 Contract created", async () => {
      const task = await TaskRequest.create({
        name: "Race Client",
        email: "race_client@suntrix.com",
        service: "Web Development",
        status: "proposal_sent",
        description: "Race condition test project description long enough to pass validation",
      });

      const token = `prop_race_${Date.now()}`;
      const proposal = await Proposal.create({
        proposalToken: token,
        taskRequestId: task._id,
        clientName: "Race Client",
        clientEmail: "race_client@suntrix.com",
        title: "Web Development Proposal",
        totalAmount: 1500,
        currency: "USD",
        status: "sent",
        expiresAt: new Date(Date.now() + 86400000),
      });

      // Mock email sending & Groq contract generation
      vi.spyOn(emailService, "sendContractEmail").mockResolvedValue();
      vi.spyOn(groqService, "generateContractWithAI").mockResolvedValue("<p>Legal Contract Terms</p>");

      // Fire 2 concurrent accept requests
      const [resA, resB] = await Promise.all([
        request(app).post(`/v1/proposals/accept/${token}`).send({ clientNote: "Accept A" }),
        request(app).post(`/v1/proposals/accept/${token}`).send({ clientNote: "Accept B" }),
      ]);

      const statuses = [resA.status, resB.status].sort();
      // One request must succeed (200), the other must return 409 Conflict (or 200 if already accepted)
      expect(statuses).toContain(200);

      // Verify DB Invariants
      const updatedProposal = await Proposal.findById(proposal._id);
      expect(updatedProposal?.status).toBe("accepted");

      const contracts = await Contract.find({ proposalId: proposal._id });
      expect(contracts.length).toBe(1);
    });

    it("should rollback proposal status to sent if AI contract generation fails", async () => {
      const task = await TaskRequest.create({
        name: "AI Error Client",
        email: "ai_err@suntrix.com",
        service: "AI Automation",
        status: "proposal_sent",
        description: "AI Error Test Project long description for validation check",
      });

      const token = `prop_aierr_${Date.now()}`;
      const proposal = await Proposal.create({
        proposalToken: token,
        taskRequestId: task._id,
        clientName: "AI Error Client",
        clientEmail: "ai_err@suntrix.com",
        title: "AI Project Proposal",
        totalAmount: 2500,
        currency: "USD",
        status: "sent",
        expiresAt: new Date(Date.now() + 86400000),
      });

      // Mock Groq AI contract generator to fail
      vi.spyOn(groqService, "generateContractWithAI").mockRejectedValue(new Error("Groq API Timeout"));

      const res = await request(app).post(`/v1/proposals/accept/${token}`).send({});
      expect(res.status).toBe(500);

      // Proposal status MUST revert to 'sent' so client can retry
      const updatedProposal = await Proposal.findById(proposal._id);
      expect(updatedProposal?.status).toBe("sent");

      const contracts = await Contract.find({ proposalId: proposal._id });
      expect(contracts.length).toBe(0);
    });
  });

  describe("B. Contract Signing Race & Unique Index Verification", () => {
    it("should verify runtime unique index exists on ProjectTracker.taskRequestId", async () => {
      const indexes = await ProjectTracker.collection.indexes();
      const taskReqIndex = indexes.find((idx: any) => idx.key.taskRequestId === 1);
      expect(taskReqIndex).toBeDefined();
      expect(taskReqIndex?.unique).toBe(true);
    });

    it("should handle 2 concurrent contract signing requests without duplicate ProjectTracker hub", async () => {
      const task = await TaskRequest.create({
        name: "Sign Race Client",
        email: "sign_race@suntrix.com",
        service: "Mobile App",
        status: "contract_sent",
        description: "Sign Race Test Project description meeting validation requirements",
      });

      const propToken = `prop_signrace_${Date.now()}`;
      const proposal = await Proposal.create({
        proposalToken: propToken,
        taskRequestId: task._id,
        clientName: "Sign Race Client",
        clientEmail: "sign_race@suntrix.com",
        title: "Mobile App Proposal",
        totalAmount: 3000,
        currency: "USD",
        status: "accepted",
        expiresAt: new Date(Date.now() + 86400000),
      });

      const contractToken = `contract_signrace_${Date.now()}`;
      await Contract.create({
        contractToken,
        proposalId: proposal._id,
        taskRequestId: task._id,
        clientName: "Sign Race Client",
        clientEmail: "sign_race@suntrix.com",
        projectTitle: "Mobile App Contract",
        fullContractText: "Legal terms for mobile application development project",
        status: "pending",
        expiresAt: new Date(Date.now() + 86400000),
      });

      vi.spyOn(emailService, "sendContractSignedNotification").mockResolvedValue();

      // Fire 2 concurrent signing requests
      const [resA, resB] = await Promise.all([
        request(app).post(`/v1/contracts/${contractToken}/sign`).send({ clientSignatureName: "Signer A", agreed: true }),
        request(app).post(`/v1/contracts/${contractToken}/sign`).send({ clientSignatureName: "Signer B", agreed: true }),
      ]);

      expect([resA.status, resB.status]).toContain(200);

      const trackers = await ProjectTracker.find({ taskRequestId: task._id });
      expect(trackers.length).toBe(1);
    });
  });

  describe("C. Stripe Webhook Idempotency & Lifecycle Events", () => {
    it("should process webhook idempotently and prevent duplicate side-effects on replay", async () => {
      const task = await TaskRequest.create({
        name: "Stripe Client",
        email: "stripe_client@suntrix.com",
        service: "Consulting",
        status: "contract_signed",
        description: "Stripe Webhook Idempotency Test description meeting validation",
      });

      const invoiceToken = `inv_stripe_${Date.now()}`;
      const payment = await Payment.create({
        invoiceToken,
        taskRequestId: task._id,
        clientName: "Stripe Client",
        clientEmail: "stripe_client@suntrix.com",
        description: "Consulting Deposit",
        amount: 500,
        currency: "USD",
        type: "invoice",
        status: "pending",
        stripeSessionId: `cs_test_${Date.now()}`,
      });

      const sendEmailSpy = vi.spyOn(emailService, "sendPaymentConfirmation").mockResolvedValue();

      // Mock Stripe webhook signature validation to succeed
      const mockEvent = {
        id: `evt_test_${Date.now()}`,
        type: "checkout.session.completed",
        data: {
          object: {
            id: payment.stripeSessionId,
            payment_intent: `pi_test_${Date.now()}`,
            customer: "cus_test_123",
            metadata: { invoiceToken },
          },
        },
      };
      // Send 1st webhook
      const res1 = await postSignedWebhook(mockEvent);
      expect(res1.status).toBe(200);

      const updatedPayment = await Payment.findById(payment._id);
      expect(updatedPayment?.status).toBe("paid");
      expect(updatedPayment?.paidAt).toBeDefined();

      const updatedTask = await TaskRequest.findById(task._id);
      expect(updatedTask?.status).toBe("in_progress");
      const inProgressHistory = updatedTask?.statusHistory.filter((h) => h.status === "in_progress");
      expect(inProgressHistory?.length).toBe(1);
      const firstEmailCalls = sendEmailSpy.mock.calls.length;

      // Send 2nd duplicate webhook (Replay)
      const res2 = await postSignedWebhook(mockEvent);
      expect(res2.status).toBe(200);

      // Verify side effects were NOT repeated
      const recheckedTask = await TaskRequest.findById(task._id);
      const recheckedHistory = recheckedTask?.statusHistory.filter((h) => h.status === "in_progress");
      expect(recheckedHistory?.length).toBe(1);
      expect(sendEmailSpy.mock.calls.length).toBe(firstEmailCalls);
    });

    // Not handled yet: `expired` is not in the Payment status enum. Enabled by T-LC-5.
    it.todo("should handle checkout.session.expired event by updating payment status to expired");
  });
});
