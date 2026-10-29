import { describe, it, expect, vi, beforeAll, beforeEach, afterAll, afterEach } from "vitest";
import crypto from "crypto";
import request from "supertest";
import app from "../app";
import TaskRequest from "../models/TaskRequest";
import Proposal from "../models/Proposal";
import Contract from "../models/Contract";
import * as email from "../services/email";
import * as groq from "../services/groq";
import { expireLifecycleDocuments } from "../lib/scheduler";
import { connectTestDb, clearTestDb, disconnectTestDb } from "./helpers/db";
import { staffToken } from "./helpers/auth";

const DAY = 86_400_000;

async function seed(taskStatus = "proposal_sent", proposal: Record<string, unknown> = {}) {
  const task = await TaskRequest.create({ name: "Ada", email: "ada@client.test", service: "AI", description: "A long enough description.", status: taskStatus });
  const p = await Proposal.create({
    proposalToken: `prop_${crypto.randomBytes(8).toString("hex")}`,
    taskRequestId: task._id,
    clientEmail: "ada@client.test",
    title: "Agent build",
    totalAmount: 500_000,
    milestones: [{ title: "All", amount: 500_000 }],
    status: "sent",
    expiresAt: new Date(Date.now() + 7 * DAY),
    ...proposal,
  });
  return { task, proposal: p };
}

const accept = (token: string) => request(app).post(`/v1/proposals/accept/${token}`);
const requestChanges = (token: string, clientNote = "Please split phase two into two milestones.") =>
  request(app).post(`/v1/proposals/request-changes/${token}`).send({ clientNote });

describe("proposal lifecycle guards (A18, M34, M35, M38, N-LC-1)", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120000);

  beforeEach(() => {
    vi.spyOn(groq, "generateContractWithAI").mockResolvedValue("<p>Terms</p>");
    for (const fn of ["sendProposalEmail", "sendContractEmail", "sendChangesRequestedNotification"] as const) {
      vi.spyOn(email, fn).mockResolvedValue();
    }
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await clearTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it("sending a draft for a new request moves it through review to proposal_sent", async () => {
    const { task, proposal } = await seed("new", { status: "draft" });
    const res = await request(app).post(`/v1/proposals/${proposal._id}/send`).set("Authorization", `Bearer ${await staffToken("admin")}`);
    expect(res.status).toBe(200);
    expect((await Proposal.findById(proposal._id))?.status).toBe("sent");
    expect((await TaskRequest.findById(task._id))?.status).toBe("proposal_sent");
  });

  it("an accepted proposal can't be re-sent", async () => {
    const { proposal } = await seed("contract_sent", { status: "accepted" });
    const res = await request(app).post(`/v1/proposals/${proposal._id}/send`).set("Authorization", `Bearer ${await staffToken("admin")}`);
    expect(res.status).toBe(409);
    expect((await Proposal.findById(proposal._id))?.status).toBe("accepted");
  });

  it("accepting creates one contract; a repeat accept returns the same contract link", async () => {
    const { task, proposal } = await seed();
    const first = await accept(proposal.proposalToken);
    expect(first.status).toBe(200);
    expect(first.body.contractToken).toMatch(/^contract_/);

    const again = await accept(proposal.proposalToken);
    expect(again.status).toBe(200);
    expect(again.body.contractToken).toBe(first.body.contractToken);

    expect(await Contract.countDocuments({ proposalId: proposal._id })).toBe(1);
    expect((await TaskRequest.findById(task._id))?.status).toBe("contract_sent");
    const view = await request(app).get(`/v1/proposals/view/${proposal.proposalToken}`);
    expect(view.body.contractToken).toBe(first.body.contractToken);
  });

  it("an expired proposal can't be accepted", async () => {
    const { proposal } = await seed("proposal_sent", { expiresAt: new Date(Date.now() - DAY) });
    expect((await accept(proposal.proposalToken)).status).toBe(410);
    expect(await Contract.countDocuments()).toBe(0);
  });

  it("a proposal for a cancelled request can't be accepted", async () => {
    const { proposal } = await seed("cancelled");
    const res = await accept(proposal.proposalToken);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("TASK_NOT_ACCEPTING");
    expect(await Contract.countDocuments()).toBe(0);
  });

  it("a failure after the contract is created removes it and restores the previous status", async () => {
    const { proposal } = await seed("proposal_sent", { status: "changes_requested" });
    vi.spyOn(email, "sendContractEmail").mockRejectedValue(new Error("mail down"));

    expect((await accept(proposal.proposalToken)).status).toBe(500);
    expect(await Contract.countDocuments()).toBe(0);
    expect((await Proposal.findById(proposal._id))?.status).toBe("changes_requested");
  });

  it("requesting changes saves the note and sends the request back to review", async () => {
    const { task, proposal } = await seed();
    const res = await requestChanges(proposal.proposalToken);
    expect(res.status).toBe(200);

    const saved = await Proposal.findById(proposal._id);
    expect(saved?.status).toBe("changes_requested");
    expect(saved?.clientNote).toBe("Please split phase two into two milestones.");
    expect((await TaskRequest.findById(task._id))?.status).toBe("in_review");
  });

  it("an accepted proposal can't be re-opened with a change request (no second contract)", async () => {
    const { proposal } = await seed();
    await accept(proposal.proposalToken);
    expect((await requestChanges(proposal.proposalToken)).status).toBe(409);
    expect((await Proposal.findById(proposal._id))?.status).toBe("accepted");
    expect(await Contract.countDocuments({ proposalId: proposal._id })).toBe(1);
  });

  it("the expiry job expires overdue proposals and contracts and releases stuck acceptances", async () => {
    const { proposal: overdue } = await seed("proposal_sent", { expiresAt: new Date(Date.now() - DAY) });
    const { proposal: stuck } = await seed("proposal_sent", { status: "processing" });
    await Proposal.collection.updateOne({ _id: stuck._id }, { $set: { updatedAt: new Date(Date.now() - 60 * 60 * 1000) } });
    const contract = await Contract.create({
      contractToken: "contract_old", proposalId: overdue._id, taskRequestId: overdue.taskRequestId, clientName: "Ada",
      clientEmail: "ada@client.test", projectTitle: "X", fullContractText: "t", status: "pending", expiresAt: new Date(Date.now() - DAY),
    });

    await expireLifecycleDocuments();
    expect((await Proposal.findById(overdue._id))?.status).toBe("expired");
    expect((await Proposal.findById(stuck._id))?.status).toBe("sent");
    expect((await Contract.findById(contract._id))?.status).toBe("expired");
  });
});
