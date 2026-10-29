import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import app from "../app";
import Post from "../models/Post";
import Portfolio from "../models/Portfolio";
import Team from "../models/Team";
import TaskRequest from "../models/TaskRequest";
import { connectTestDb, clearTestDb, disconnectTestDb } from "./helpers/db";
import { staffToken } from "./helpers/auth";

let auth: Record<string, string> = {};

describe("mass-assignment guards (T-BR-3)", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120000);

  afterEach(async () => {
    await clearTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  const admin = async () => {
    auth = { Authorization: `Bearer ${await staffToken("admin")}` };
    return auth;
  };

  it("rejects counters on create and ignores unknown or operator keys", async () => {
    const headers = await admin();
    const rejected = await request(app).post("/v1/posts").set(headers).send({ title: "Hello", slug: "hello", content: "<p>x</p>", views: 99999 });
    expect(rejected.status).toBe(400);
    expect(rejected.body.error).toMatch(/views/);

    const res = await request(app)
      .post("/v1/posts")
      .set(headers)
      .send({ title: "Hello", slug: "hello", content: "<p>x</p>", isAdminOverride: true, $where: "1", "author.name": "x" });
    expect(res.status).toBe(201);
    const post = await Post.findOne({ slug: "hello" }).lean();
    expect(post?.views ?? 0).toBe(0);
    expect(post).not.toHaveProperty("isAdminOverride");
  });

  it("task update can't change workflow state, tokens or soft-delete", async () => {
    const headers = await admin();
    const task = await TaskRequest.create({ name: "Ada", email: "ada@client.test", service: "AI", description: "A long enough description." });

    for (const field of [{ status: "completed" }, { trackingToken: "x" }, { deletedAt: new Date().toISOString() }]) {
      const res = await request(app).put(`/v1/task-requests/${task._id}`).set(headers).send(field);
      expect(res.status).toBe(400);
    }
    expect((await TaskRequest.findById(task._id))?.status).toBe("new");

    const ok = await request(app).put(`/v1/task-requests/${task._id}`).set(headers).send({ projectTitle: "Agent build", notes: "VIP" });
    expect(ok.status).toBe(200);
    expect((await TaskRequest.findById(task._id))?.projectTitle).toBe("Agent build");
  });

  it("bulk update only touches allow-listed fields", async () => {
    const headers = await admin();
    const p = await Portfolio.create({ title: "P", slug: "p", category: "AI" });

    const bad = await request(app).put("/v1/portfolio/bulk").set(headers).send({ ids: [String(p._id)], update: { slug: "hijacked" } });
    expect(bad.status).toBe(400);

    const ok = await request(app).put("/v1/portfolio/bulk").set(headers).send({ ids: [String(p._id)], update: { status: "published" } });
    expect(ok.status).toBe(200);
    expect((await Portfolio.findById(p._id))?.status).toBe("published");
  });

  it("validates schema values on update (enums)", async () => {
    const headers = await admin();
    const p = await Portfolio.create({ title: "P", slug: "p2", category: "AI" });
    const res = await request(app).put(`/v1/portfolio/${p._id}`).set(headers).send({ status: "not-a-status" });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await Portfolio.findById(p._id))?.status).toBe("draft");
  });

  it("bulk endpoints validate ids and cap batch size", async () => {
    const headers = await admin();
    expect((await request(app).delete("/v1/team/bulk").set(headers).send({ ids: ["not-an-id"] })).status).toBe(400);
    expect((await request(app).delete("/v1/team/bulk").set(headers).send({ ids: [] })).status).toBe(400);

    const items = Array.from({ length: 501 }, (_, i) => ({ name: `M${i}`, role: "Eng" }));
    expect((await request(app).post("/v1/team/bulk/import").set(headers).send({ items })).status).toBe(400);
    expect(await Team.countDocuments()).toBe(0);

    const ok = await request(app).post("/v1/team/bulk/import").set(headers).send({ items: items.slice(0, 2) });
    expect(ok.status).toBe(201);
    expect(await Team.countDocuments()).toBe(2);
  });
});
