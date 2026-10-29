import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import request from "supertest";
import app from "../app";
import Portfolio from "../models/Portfolio";
import Post from "../models/Post";
import JobRun from "../models/JobRun";
import AuditLog from "../models/AuditLog";
import { autoPublishScheduledContent, pruneAuditLog } from "../lib/scheduler";
import { runExclusive } from "../lib/jobLock";
import { updateSettingCache } from "../lib/configLoader";
import { connectTestDb, clearTestDb, disconnectTestDb } from "./helpers/db";
import { staffToken } from "./helpers/auth";

const HOUR = 3_600_000;
const item = (extra: Record<string, unknown>) => ({ title: "Project", slug: `p-${Math.random().toString(36).slice(2)}`, category: "AI", description: "d", ...extra });

describe("scheduler (T-OPA-9)", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120000);

  afterEach(async () => {
    updateSettingCache("AUDIT_LOG_RETENTION_DAYS", "");
    await clearTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it("publishes scheduled portfolio items; an un-published item with an old publishAt stays a draft", async () => {
    const due = await Portfolio.create(item({ status: "scheduled", publishAt: new Date(Date.now() - 60_000) }));
    const later = await Portfolio.create(item({ status: "scheduled", publishAt: new Date(Date.now() + HOUR) }));
    const unpublished = await Portfolio.create(item({ status: "draft", publishAt: new Date(Date.now() - HOUR) }));
    await Post.create({ title: "P", slug: "p", content: "c", status: "scheduled", publishAt: new Date(Date.now() - 1000) });

    expect(await autoPublishScheduledContent()).toEqual({ posts: 1, portfolio: 1 });
    const published = await Portfolio.findById(due._id).lean();
    expect(published?.status).toBe("published");
    expect(published?.publishAt).toBeUndefined();
    expect((await Portfolio.findById(later._id))?.status).toBe("scheduled");
    expect((await Portfolio.findById(unpublished._id))?.status).toBe("draft");
  });

  it("the admin API schedules a draft with a future date and refuses to schedule in the past", async () => {
    const auth = { Authorization: `Bearer ${await staffToken("admin")}` };
    const created = await request(app).post("/v1/portfolio").set(auth).send(item({ publishAt: new Date(Date.now() + HOUR).toISOString() }));
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("scheduled");

    const past = await request(app).put(`/v1/portfolio/${created.body._id}`).set(auth).send({ status: "scheduled", publishAt: new Date(Date.now() - HOUR).toISOString() });
    expect(past.status).toBe(400);

    const publishNow = await request(app).put(`/v1/portfolio/${created.body._id}`).set(auth).send({ status: "published" });
    expect(publishNow.body.status).toBe("published");
    expect(publishNow.body.publishAt).toBeFalsy();

    const unpublish = await request(app).put(`/v1/portfolio/${created.body._id}`).set(auth).send({ status: "draft" });
    expect(unpublish.body.status).toBe("draft");
    await autoPublishScheduledContent(new Date(Date.now() + 2 * HOUR));
    expect((await Portfolio.findById(created.body._id))?.status).toBe("draft");
  });

  it("two instances firing the same tick run the job once and record one JobRun", async () => {
    let calls = 0;
    const job = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 20));
      return { ok: 1 };
    };
    const results = await Promise.all([runExclusive("tick", 60_000, job, "instance-a"), runExclusive("tick", 60_000, job, "instance-b")]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(calls).toBe(1);
    const runs = await JobRun.find({ name: "tick" }).lean();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ ok: true, result: { ok: 1 } });

    // Still within the hold: a late instance skips too
    expect(await runExclusive("tick", 60_000, job, "instance-c")).toBe(false);
  });

  it("a failing job is recorded and does not throw", async () => {
    expect(await runExclusive("broken", 60_000, async () => { throw new Error("nope"); }, "a")).toBe(true);
    expect(await JobRun.findOne({ name: "broken" }).lean()).toMatchObject({ ok: false, error: "nope" });
  });

  it("audit retention deletes only entries older than the configured days; 0 keeps everything", async () => {
    const base = { action: "update", entity: "x", entityId: "1", entityName: "x", adminId: "a", adminName: "A" };
    await AuditLog.create({ ...base, createdAt: new Date(Date.now() - 40 * 24 * HOUR) });
    await AuditLog.create({ ...base });
    updateSettingCache("AUDIT_LOG_RETENTION_DAYS", "30");
    expect(await pruneAuditLog()).toBe(1);
    updateSettingCache("AUDIT_LOG_RETENTION_DAYS", "0");
    expect(await pruneAuditLog(new Date(Date.now() + 365 * 24 * HOUR))).toBe(0);
  });
});
