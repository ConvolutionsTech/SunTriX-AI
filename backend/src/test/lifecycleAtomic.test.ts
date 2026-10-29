import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import crypto from "crypto";
import request from "supertest";
import app from "../app";
import TaskRequest from "../models/TaskRequest";
import ProjectTracker from "../models/ProjectTracker";
import * as email from "../services/email";
import { TaskStatusMachine } from "../services/taskStatusMachine";
import { connectTestDb, clearTestDb, disconnectTestDb } from "./helpers/db";

const newTask = (status: string) =>
  TaskRequest.create({ name: "Ada", email: "ada@client.test", service: "AI", description: "A long enough description.", status });

describe("atomic status transitions (T-LC-1, A19)", () => {
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

  it("an admin cancel and a system transition racing: exactly one wins", async () => {
    const task = await newTask("contract_signed");
    const results = await Promise.allSettled([
      TaskStatusMachine.transition(task._id, "cancelled", "admin"),
      TaskStatusMachine.transition(task._id, "in_progress", "system"),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason.statusCode).toBe(409);

    const after = await TaskRequest.findById(task._id);
    expect(after?.statusHistory.filter((h) => ["cancelled", "in_progress"].includes(h.status))).toHaveLength(1);
  });

  it("is a no-op when the task is already in the target status", async () => {
    const task = await newTask("in_review");
    const same = await TaskStatusMachine.transition(task._id, "in_review", "admin");
    expect(same.statusHistory).toHaveLength(task.statusHistory.length);
  });

  it("two concurrent completion approvals: one 200, one 409, one admin email", async () => {
    const approved = vi.spyOn(email, "sendTrackerCompletionApprovedEmail").mockResolvedValue();
    const task = await newTask("in_progress");
    const trackerToken = crypto.randomUUID();
    await ProjectTracker.create({ taskRequestId: task._id, proposalId: task._id, trackerToken, completionRequestedAt: new Date() });

    const [a, b] = await Promise.all([
      request(app).post(`/v1/tracker/client/${trackerToken}/completion/approve`),
      request(app).post(`/v1/tracker/client/${trackerToken}/completion/approve`),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect((await TaskRequest.findById(task._id))?.status).toBe("completed");
    expect(approved).toHaveBeenCalledTimes(1);
  });

  it("approval can't complete a cancelled project, and releases the claim", async () => {
    const task = await newTask("cancelled");
    const trackerToken = crypto.randomUUID();
    await ProjectTracker.create({ taskRequestId: task._id, proposalId: task._id, trackerToken, completionRequestedAt: new Date() });

    const res = await request(app).post(`/v1/tracker/client/${trackerToken}/completion/approve`);
    expect(res.status).toBe(400);
    expect((await TaskRequest.findById(task._id))?.status).toBe("cancelled");
    expect((await ProjectTracker.findOne({ trackerToken }))?.completionApprovedAt).toBeFalsy();
  });
});
