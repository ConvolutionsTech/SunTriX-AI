import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import crypto from "crypto";
import request from "supertest";
import app from "../app";
import TaskRequest from "../models/TaskRequest";
import Proposal from "../models/Proposal";
import Contract from "../models/Contract";
import Payment from "../models/Payment";
import ProjectTracker from "../models/ProjectTracker";
import * as email from "../services/email";
import { connectTestDb, clearTestDb, disconnectTestDb } from "./helpers/db";

const DAY = 86_400_000;
const keysDeep = (v: unknown, out = new Set<string>()): Set<string> => {
  if (Array.isArray(v)) v.forEach((x) => keysDeep(x, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { out.add(k); keysDeep(x, out); }
  return out;
};

describe("client capability links expose only client-facing fields (M28)", () => {
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

  async function seed() {
    const task = await TaskRequest.create({
      name: "Ada", email: "ada@client.test", phone: "+1 555", service: "AI", description: "A long enough description.",
      status: "contract_signed", trackingToken: "trk_secret", contractToken: "contract_secret", notes: "VIP — discount ok",
      statusHistory: [{ status: "new", note: "internal admin note", updatedAt: new Date() }],
    });
    const proposal = await Proposal.create({
      proposalToken: "prop_x", taskRequestId: task._id, clientEmail: "ada@client.test", title: "Agent build",
      totalAmount: 100_00, milestones: [{ title: "All", amount: 100_00 }], status: "sent", expiresAt: new Date(Date.now() + DAY),
    });
    const contract = await Contract.create({
      contractToken: "contract_x", proposalId: proposal._id, taskRequestId: task._id, clientName: "Ada", clientEmail: "ada@client.test",
      projectTitle: "Agent build", fullContractText: "<p>Terms</p>", status: "signed", expiresAt: new Date(Date.now() + DAY),
      clientIp: "203.0.113.9", userAgent: "Mozilla/5.0",
    });
    const payment = await Payment.create({
      invoiceToken: "inv_x", taskRequestId: task._id, clientEmail: "ada@client.test", description: "Deposit", amount: 100_00,
      type: "invoice", status: "paid", stripeSessionId: "cs_secret", stripePaymentIntentId: "pi_secret", trackingToken: "trk_secret",
    });
    const tracker = await ProjectTracker.create({
      taskRequestId: task._id, proposalId: proposal._id, trackerToken: crypto.randomUUID(),
      deliverables: [{ title: "Console", status: "InReview" }],
      milestones: [{ title: "All", amount: 100_00, dueDate: new Date(), stripePaymentIntentId: "pi_secret" }],
      auditLog: [{ action: "x", actor: "Admin", actorRole: "Admin", timestamp: new Date() }],
    });
    return { task, proposal, contract, payment, tracker };
  }

  it("proposal view: no internal request data", async () => {
    await seed();
    const res = await request(app).get("/v1/proposals/view/prop_x");
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Agent build");
    const body = JSON.stringify(res.body);
    for (const secret of ["internal admin note", "trk_secret", "contract_secret", "+1 555", "VIP"]) expect(body).not.toContain(secret);
  });

  it("contract view: no signer IP or user agent", async () => {
    await seed();
    const res = await request(app).get("/v1/contracts/contract_x");
    expect(res.status).toBe(200);
    expect(res.body.fullContractText).toBe("<p>Terms</p>");
    expect(keysDeep(res.body)).not.toContain("clientIp");
    expect(keysDeep(res.body)).not.toContain("userAgent");
  });

  it("invoice view: no Stripe identifiers", async () => {
    await seed();
    const res = await request(app).get("/v1/payments/invoice/inv_x");
    expect(res.status).toBe(200);
    expect(res.body.amount).toBe(100_00);
    expect(JSON.stringify(res.body)).not.toMatch(/cs_secret|pi_secret/);
  });

  it("tracker client actions never return the audit log", async () => {
    vi.spyOn(email, "sendTrackerClientActionToAdminEmail").mockResolvedValue();
    const { tracker } = await seed();
    const dId = tracker.deliverables[0]._id;
    const res = await request(app).post(`/v1/tracker/client/${tracker.trackerToken}/deliverable/${dId}/approve`);
    expect(res.status).toBe(200);
    expect(keysDeep(res.body)).not.toContain("auditLog");
    expect(JSON.stringify(res.body)).not.toContain("pi_secret");

    const view = await request(app).get(`/v1/tracker/client/${tracker.trackerToken}`);
    expect(keysDeep(view.body)).not.toContain("auditLog");
  });
});
