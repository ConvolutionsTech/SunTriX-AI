import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { taskRequestService } from "../modules/task-requests/task-request.service";
import { proposalService } from "../modules/proposals/proposal.service";
import { contractService } from "../modules/contracts/contract.service";
import { paymentService } from "../modules/payments/payment.service";
import TaskRequest from "../models/TaskRequest";
import ProjectTracker from "../models/ProjectTracker";
import * as groqService from "../services/groq";
import { connectTestDb, disconnectTestDb } from "./helpers/db";

describe("Phase 5.15 Full End-to-End Business Lifecycle Test", () => {
  beforeAll(async () => {
    await connectTestDb();
    vi.spyOn(groqService, "generateContractWithAI").mockResolvedValue("Mocked Legal Contract Text for automated test.");
  }, 120000);

  afterAll(async () => {
    vi.restoreAllMocks();
    await disconnectTestDb();
  });

  it("should execute complete lifecycle: Submission -> Proposal -> Contract -> Project Hub -> Invoice Payment", async () => {
    // 1. Client Submits Task Request
    const submitResult = await taskRequestService.submitRequest({
      name: "Acme Enterprise",
      email: "acme_lifecycle@suntrix.com",
      service: "AI Agent Development",
      description: "Build an automated customer support AI agent.",
      budget: "$5,000",
    });

    expect(submitResult.task).toBeDefined();
    const taskRequestId = submitResult.task._id.toString();
    expect(submitResult.task.status).toBe("new");

    // 2. Admin Reviews Task Request
    await taskRequestService.transitionStatus(taskRequestId, "in_review", "admin");
    const taskInReview = await TaskRequest.findById(taskRequestId);
    expect(taskInReview?.status).toBe("in_review");

    // 3. Admin Creates Proposal Draft
    const proposal = await proposalService.createProposal({
      taskRequestId,
      clientEmail: "acme_lifecycle@suntrix.com",
      clientName: "Acme Enterprise",
      title: "Acme AI Support Agent Proposal",
      totalAmount: 500000, // $5,000.00
      currency: "USD",
      scopeItems: ["RAG Knowledge Pipeline", "Custom LLM Integration"],
    });

    expect(proposal._id).toBeDefined();
    expect(proposal.status).toBe("draft");

    // 4. Admin Sends Proposal to Client
    const sentProposal = await proposalService.sendProposal(proposal._id.toString());
    expect(sentProposal.status).toBe("sent");

    // Verify Task Request status transitioned to proposal_sent
    const taskAfterProp = await TaskRequest.findById(taskRequestId);
    expect(taskAfterProp?.status).toBe("proposal_sent");

    // 5. Client Accepts Proposal (Atomically generates Contract)
    const acceptResult = await proposalService.acceptProposal(proposal.proposalToken);
    expect(acceptResult.contractToken).toBeDefined();
    expect(acceptResult.proposal.status).toBe("accepted");

    // Verify Task Request status transitioned to contract_sent
    const taskAfterAccept = await TaskRequest.findById(taskRequestId);
    expect(taskAfterAccept?.status).toBe("contract_sent");

    // 6. Client Signs Contract (Atomically initializes Project Workspace)
    const signResult = await contractService.signContract({
      token: acceptResult.contractToken,
      clientSignatureName: "John Doe",
      clientIp: "127.0.0.1",
    });

    expect(signResult.contract.status).toBe("signed");
    expect(signResult.trackerToken).toBeDefined();

    // Verify Project Workspace created in DB
    const tracker = await ProjectTracker.findOne({ taskRequestId });
    expect(tracker).not.toBeNull();
    expect(tracker?.trackerToken).toBeDefined();

    // Verify Task Request status transitioned to contract_signed
    const taskAfterSign = await TaskRequest.findById(taskRequestId);
    expect(taskAfterSign?.status).toBe("contract_signed");

    // 7. Admin Creates Invoice
    const invoiceResult = await paymentService.createInvoice({
      taskRequestId,
      clientEmail: "acme_lifecycle@suntrix.com",
      clientName: "Acme Enterprise",
      description: "Deposit Payment for AI Agent Development",
      amountCents: 250000, // $2,500 deposit
    });

    expect(invoiceResult.payment.status).toBe("pending");
    expect(invoiceResult.invoiceUrl).toBeDefined();

    // 8. Client Pays Invoice (Simulate Stripe Webhook payment confirmation)
    await paymentService.handlePaymentPaidSideEffects(invoiceResult.payment);

    // Verify Task Request status transitioned to in_progress upon primary deposit payment
    const finalTask = await TaskRequest.findById(taskRequestId);
    expect(finalTask?.status).toBe("in_progress");
  }, 30000);
});
