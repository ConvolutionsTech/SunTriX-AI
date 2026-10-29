import { describe, it, expect, vi, beforeAll, beforeEach, afterAll, afterEach } from "vitest";
import crypto from "crypto";
import request from "supertest";
import app from "../app";
import TaskRequest from "../models/TaskRequest";
import ProjectTracker from "../models/ProjectTracker";
import * as email from "../services/email";
import { connectTestDb, clearTestDb, disconnectTestDb } from "./helpers/db";

async function seed() {
  const task = await TaskRequest.create({ name: "Ada", email: "ada@client.test", service: "AI", description: "A long enough description.", status: "in_progress" });
  return ProjectTracker.create({
    taskRequestId: task._id, proposalId: task._id, trackerToken: crypto.randomUUID(),
    deliverables: [{ title: "Console", status: "InReview" }, { title: "Docs", status: "Pending" }],
    files: [{ filename: "spec.pdf", cloudinaryUrl: "https://cdn.test/spec.pdf", cloudinaryPublicId: "projects/spec", approvalStatus: "Pending" }],
    updates: [{ type: "ProgressUpdate", body: "Sprint 1 done" }],
  });
}

describe("tracker client actions (N-BR-6, T-BR-14)", () => {
  let adminEmail: { mock: { calls: unknown[] } };

  beforeAll(async () => {
    await connectTestDb();
  }, 120000);

  beforeEach(() => {
    adminEmail = vi.spyOn(email, "sendTrackerClientActionToAdminEmail").mockResolvedValue();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await clearTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it("a deliverable can be approved once; repeats are 409 with no second email", async () => {
    const t = await seed();
    const url = `/v1/tracker/client/${t.trackerToken}/deliverable/${t.deliverables[0]._id}/approve`;
    const [a, b] = await Promise.all([request(app).post(url), request(app).post(url)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(adminEmail.mock.calls).toHaveLength(1);
  });

  it("only deliverables in review can be approved or rejected", async () => {
    const t = await seed();
    const pending = t.deliverables[1]._id;
    expect((await request(app).post(`/v1/tracker/client/${t.trackerToken}/deliverable/${pending}/approve`)).status).toBe(409);
    expect((await request(app).post(`/v1/tracker/client/${t.trackerToken}/deliverable/${pending}/reject`).send({ clientRejectionNote: "x" })).status).toBe(409);
    expect((await ProjectTracker.findById(t._id))!.deliverables[1].status).toBe("Pending");
  });

  it("a file decision is final", async () => {
    const t = await seed();
    const base = `/v1/tracker/client/${t.trackerToken}/file/${t.files[0]._id}`;
    expect((await request(app).post(`${base}/approve`)).status).toBe(200);
    expect((await request(app).post(`${base}/reject`).send({ clientComment: "changed my mind" })).status).toBe(409);
    expect((await ProjectTracker.findById(t._id))!.files[0].approvalStatus).toBe("Approved");
  });

  it("acknowledging an update twice is harmless", async () => {
    const t = await seed();
    const url = `/v1/tracker/client/${t.trackerToken}/update/${t.updates[0]._id}/acknowledge`;
    expect((await request(app).post(url)).status).toBe(200);
    const first = (await ProjectTracker.findById(t._id))!.updates[0].clientAcknowledgedAt;
    expect((await request(app).post(url)).status).toBe(200);
    expect((await ProjectTracker.findById(t._id))!.updates[0].clientAcknowledgedAt).toEqual(first);
  });

  it("limits actions per project link (30 per 15 minutes)", async () => {
    const t = await seed();
    const url = `/v1/tracker/client/${t.trackerToken}/update/${t.updates[0]._id}/acknowledge`;
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) statuses.push((await request(app).post(url)).status);
    expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
    expect(statuses[30]).toBe(429);
    expect((await request(app).get(`/v1/tracker/client/${t.trackerToken}`)).status).toBe(200); // reads aren't limited
  });
});
