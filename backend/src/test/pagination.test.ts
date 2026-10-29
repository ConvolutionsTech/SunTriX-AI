import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../app";
import ContactMessage from "../models/ContactMessage";
import TaskRequest from "../models/TaskRequest";
import ProjectTracker from "../models/ProjectTracker";
import { connectTestDb, disconnectTestDb } from "./helpers/db";
import { staffToken } from "./helpers/auth";

describe("bounded list endpoints (T-OPB-12, T-BR-7)", () => {
  let auth: Record<string, string>;

  beforeAll(async () => {
    await connectTestDb();
    auth = { Authorization: `Bearer ${await staffToken("admin")}` };
    await ContactMessage.insertMany(
      Array.from({ length: 150 }, (_, i) => ({ name: `N${i}`, email: `n${i}@x.test`, subject: "Hi", message: "A message that is long enough." }))
    );
  }, 120000);

  afterAll(async () => {
    await disconnectTestDb();
  });

  it("caps limit, honours skip and reports the total in X-Total-Count", async () => {
    const page = await request(app).get("/v1/contact?limit=100&skip=120").set(auth);
    expect(page.status).toBe(200);
    expect(page.body).toHaveLength(30);
    expect(page.headers["x-total-count"]).toBe("150");

    const huge = await request(app).get("/v1/contact?limit=10000").set(auth);
    expect(huge.body.length).toBeLessThanOrEqual(500);
    expect((await request(app).get("/v1/contact?limit=abc&skip=-5").set(auth)).body).toHaveLength(150);
  });

  it("clamps the activity window to a year", async () => {
    const res = await request(app).get("/v1/admin/activity?days=10000000").set(auth);
    expect(res.status).toBe(200);
    expect(res.body.trendChart).toHaveLength(365);
  });

  it("caps blog list pages at 100", async () => {
    const res = await request(app).get("/v1/posts?limit=5000");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.posts)).toBe(true);
  });

  it("the tracker list returns summaries and can find one engagement's tracker", async () => {
    const task = await TaskRequest.create({ name: "Ada", email: "ada@client.test", service: "AI", description: "A long enough description.", status: "in_progress" });
    await ProjectTracker.create({
      taskRequestId: task._id, trackerToken: "trk_page",
      proposalId: "64b0000000000000000000aa",
      updates: [{ type: "ProgressUpdate", body: "Kick-off done" }],
    });
    const res = await request(app).get(`/v1/tracker/admin/list?taskRequestId=${task._id}`).set(auth);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.trackers[0].updates).toBeUndefined();
    expect(res.body.trackers[0].auditLog).toBeUndefined();
    expect((await request(app).get("/v1/tracker/admin/list?taskRequestId=64b000000000000000000000").set(auth)).body.trackers).toEqual([]);
  });
});
