import { describe, it, expect, vi, beforeAll, afterEach, afterAll } from "vitest";
import request from "supertest";
import app from "../app";
import TaskRequest from "../models/TaskRequest";
import ProjectTracker from "../models/ProjectTracker";
import * as email from "../services/email";
import { connectTestDb, clearTestDb, disconnectTestDb } from "./helpers/db";
import { staffToken } from "./helpers/auth";

describe("tracker admin validation (T-LC-10)", () => {
  let auth: Record<string, string>;
  let trackerId: string;

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
    auth = { Authorization: `Bearer ${await staffToken("admin")}` };
    const task = await TaskRequest.create({ name: "Ada", email: "ada@client.test", service: "AI", description: "A long enough description.", status: "in_progress" });
    const tracker = await ProjectTracker.create({
      taskRequestId: task._id, proposalId: "64b0000000000000000000aa", trackerToken: "trk_val",
      deliverables: [{ title: "Spec" }],
    });
    trackerId = String(tracker._id);
    return tracker;
  }

  it("a malformed update is a 400, not a 500", async () => {
    await seed();
    const res = await request(app).post(`/v1/tracker/admin/${trackerId}/update`).set(auth).send({ title: "foo" });
    expect(res.status).toBe(400);
  });

  it("phases advance one step at a time and only to known phases", async () => {
    const tracker = await seed();
    vi.spyOn(email, "sendTrackerPhaseAdvancedEmail").mockResolvedValue();
    expect(tracker.currentPhase).toBe("Discovery");
    expect((await request(app).post(`/v1/tracker/admin/${trackerId}/phase/advance`).set(auth).send({ nextPhase: "Delivery" })).status).toBe(400);
    expect((await request(app).post(`/v1/tracker/admin/${trackerId}/phase/advance`).set(auth).send({ nextPhase: "Party" })).status).toBe(400);
    const ok = await request(app).post(`/v1/tracker/admin/${trackerId}/phase/advance`).set(auth).send({ nextPhase: "Design" });
    expect(ok.status).toBe(200);
    expect((await ProjectTracker.findById(trackerId))?.currentPhase).toBe("Design");
  });

  it("a deliverable link must be http(s)", async () => {
    const tracker = await seed();
    const dId = String(tracker.deliverables[0]._id);
    const res = await request(app).post(`/v1/tracker/admin/${trackerId}/deliverable/${dId}/complete`).set(auth).send({ attachedUrl: "javascript:alert(1)" });
    expect(res.status).toBe(400);
  });
});
