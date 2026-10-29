import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import crypto from "crypto";
import request from "supertest";
import app from "../app";
import TaskRequest from "../models/TaskRequest";
import ProjectTracker from "../models/ProjectTracker";
import * as email from "../services/email";
import { connectTestDb, clearTestDb, disconnectTestDb } from "./helpers/db";
import { staffToken } from "./helpers/auth";

async function seedTracker() {
  const task = await TaskRequest.create({ name: "Ada", email: "ada@client.test", service: "AI", description: "A long enough description.", status: "in_progress" });
  return ProjectTracker.create({
    taskRequestId: task._id, proposalId: task._id, trackerToken: crypto.randomUUID(),
    milestones: [{ title: "Discovery", amount: 150_000, dueDate: new Date(), paymentRequestedAt: new Date() }],
  });
}

describe("tracker admin actions (T-FE-7, N-BR-7, N-LC-9)", () => {
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

  it("posts an update with its type, body and next-update date", async () => {
    vi.spyOn(email, "sendTrackerUpdateEmail").mockResolvedValue();
    const tracker = await seedTracker();
    const res = await request(app)
      .post(`/v1/tracker/admin/${tracker._id}/update`)
      .set("Authorization", `Bearer ${await staffToken("admin")}`)
      .send({ type: "Blocker", body: "Waiting on API keys", nextUpdateDue: "2026-11-05" });
    expect(res.status).toBe(200);

    const saved = (await ProjectTracker.findById(tracker._id))!.updates[0];
    expect(saved.type).toBe("Blocker");
    expect(saved.body).toBe("Waiting on API keys");
    expect(saved.nextUpdateDue?.toISOString().slice(0, 10)).toBe("2026-11-05");
  });

  it("rejects an unknown update type with 400 (not a 500 from the model enum)", async () => {
    const tracker = await seedTracker();
    const res = await request(app)
      .post(`/v1/tracker/admin/${tracker._id}/update`)
      .set("Authorization", `Bearer ${await staffToken("admin")}`)
      .send({ type: "Weekly status", body: "x" });
    expect(res.status).toBe(400);
  });

  it("records an off-platform milestone payment", async () => {
    vi.spyOn(email, "sendTrackerPaymentConfirmedEmail").mockResolvedValue();
    const tracker = await seedTracker();
    const mId = tracker.milestones[0]._id;
    const res = await request(app)
      .post(`/v1/tracker/admin/${tracker._id}/milestone/${mId}/mark-paid-manually`)
      .set("Authorization", `Bearer ${await staffToken("admin")}`)
      .send({ note: "Bank transfer #123" });
    expect(res.status).toBe(200);
    expect((await ProjectTracker.findById(tracker._id))!.milestones[0].paidAt).toBeTruthy();
  });
});
