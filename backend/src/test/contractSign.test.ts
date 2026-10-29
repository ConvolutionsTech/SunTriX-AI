import { describe, it, expect, vi, beforeAll, beforeEach, afterAll, afterEach } from "vitest";
import crypto from "crypto";
import request from "supertest";
import app from "../app";
import TaskRequest from "../models/TaskRequest";
import Proposal from "../models/Proposal";
import Contract from "../models/Contract";
import ProjectTracker from "../models/ProjectTracker";
import * as email from "../services/email";
import { connectTestDb, clearTestDb, disconnectTestDb } from "./helpers/db";

const DAY = 86_400_000;

async function seed(taskStatus = "contract_sent", contract: Record<string, unknown> = {}) {
  const task = await TaskRequest.create({ name: "Ada", email: "ada@client.test", service: "AI", description: "A long enough description.", status: taskStatus });
  const proposal = await Proposal.create({
    proposalToken: `prop_${crypto.randomBytes(8).toString("hex")}`, taskRequestId: task._id, clientEmail: "ada@client.test",
    title: "Agent build", totalAmount: 500_000, status: "accepted", expiresAt: new Date(Date.now() + 7 * DAY),
    scopeItems: ["RAG pipeline", "Admin console"],
    milestones: [{ title: "Discovery", amount: 150_000, dueWeek: 2 }, { title: "Build", amount: 350_000, dueWeek: 6 }],
  });
  const c = await Contract.create({
    contractToken: `contract_${crypto.randomBytes(8).toString("hex")}`, proposalId: proposal._id, taskRequestId: task._id,
    clientName: "Ada", clientEmail: "ada@client.test", projectTitle: "Agent build", fullContractText: "<p>Terms</p>",
    status: "pending", expiresAt: new Date(Date.now() + 7 * DAY), ...contract,
  });
  return { task, proposal, contract: c };
}

const sign = (token: string) => request(app).post(`/v1/contracts/${token}/sign`).send({ clientSignatureName: "Ada Lovelace", agreed: true });

describe("contract signing (A18, M36, M37, N-LC-8)", () => {
  let signed: { mock: { calls: unknown[] } };

  beforeAll(async () => {
    await connectTestDb();
  }, 120000);

  beforeEach(() => {
    signed = vi.spyOn(email, "sendContractSignedNotification").mockResolvedValue();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await clearTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it("signs, moves the request on and builds the tracker from the proposal", async () => {
    const { task, contract } = await seed();
    const res = await sign(contract.contractToken);
    expect(res.status).toBe(200);
    expect(res.body.trackerToken).toBeTruthy();
    expect(res.body).not.toHaveProperty("checkoutUrl");
    expect(Object.keys(res.body.contract).sort()).toEqual(["clientSignatureName", "signedAt", "status"]);

    expect((await TaskRequest.findById(task._id))?.status).toBe("contract_signed");
    const tracker = await ProjectTracker.findOne({ taskRequestId: task._id }).lean();
    expect(tracker?.phases.map((p) => p.name)).toEqual(["Discovery"]);
    expect(tracker?.milestones.map((m) => [m.title, m.amount])).toEqual([["Discovery", 150_000], ["Build", 350_000]]);
    expect(tracker?.deliverables.map((d) => d.title)).toEqual(["RAG pipeline", "Admin console"]);
    expect(signed).toHaveBeenCalledTimes(1);
  });

  it("signing again is a 409 and sends no second notification", async () => {
    const { contract } = await seed();
    expect((await sign(contract.contractToken)).status).toBe(200);
    expect((await sign(contract.contractToken)).status).toBe(409);
    expect(signed).toHaveBeenCalledTimes(1);
    expect(await ProjectTracker.countDocuments()).toBe(1);
  });

  it("an expired contract can't be signed and stays pending", async () => {
    const { contract } = await seed("contract_sent", { expiresAt: new Date(Date.now() - DAY) });
    expect((await sign(contract.contractToken)).status).toBe(410);
    expect((await Contract.findById(contract._id))?.status).toBe("pending");
  });

  it("a cancelled request can't be signed", async () => {
    const { contract } = await seed("cancelled");
    expect((await sign(contract.contractToken)).status).toBe(400);
    expect((await Contract.findById(contract._id))?.status).toBe("pending");
    expect(await ProjectTracker.countDocuments()).toBe(0);
  });

  it("a deleted request gives a clear 410, not a crash", async () => {
    const { task, contract } = await seed();
    await TaskRequest.deleteOne({ _id: task._id });
    expect((await sign(contract.contractToken)).status).toBe(410);
  });
});
