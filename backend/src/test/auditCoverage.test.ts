import { describe, it, expect, vi, beforeAll, afterEach, afterAll } from "vitest";
import request from "supertest";
import app from "../app";
import AuditLog from "../models/AuditLog";
import Testimonial from "../models/Testimonial";
import * as cloudinaryService from "../services/cloudinary";
import { seedAdmin } from "../scripts/seedAdmin";
import { connectTestDb, clearTestDb, disconnectTestDb } from "./helpers/db";
import { staffToken } from "./helpers/auth";

/** Audit rows are written after the response; wait until `n` exist. */
const rows = async (n: number, filter: Record<string, unknown> = {}) => {
  await vi.waitFor(async () => expect(await AuditLog.countDocuments(filter)).toBe(n));
  return AuditLog.find(filter).sort({ createdAt: 1 }).lean();
};

describe("audit coverage (T-OPA-12)", () => {
  let auth: Record<string, string>;

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

  const admin = async () => (auth = { Authorization: `Bearer ${await staffToken("admin")}` });

  it("testimonial create, update and delete are audited", async () => {
    await admin();
    const created = await request(app).post("/v1/testimonials").set(auth).send({ name: "Ada", role: "CTO", company: "X", quote: "Great work", rating: 5 });
    expect(created.status).toBe(201);
    await request(app).put(`/v1/testimonials/${created.body._id}`).set(auth).send({ quote: "Great!" });
    await request(app).delete(`/v1/testimonials/${created.body._id}`).set(auth);
    const audit = await rows(3, { entity: "testimonial" });
    expect(audit.map((a) => a.action)).toEqual(["create", "update", "delete"]);
    expect(audit[1].entityId).toBe(String(created.body._id));
  });

  it("CMS edits are audited with what changed", async () => {
    await admin();
    expect((await request(app).put("/v1/cms/hero").set(auth).send({ title: "New headline" })).status).toBe(200);
    const [row] = await rows(1, { entity: "cms" });
    expect(row).toMatchObject({ action: "update", entityName: "PUT /v1/cms/hero" });
    expect(row.diff).toMatchObject({ changes: { title: "New headline" } });
  });

  it("media deletion and tracker admin actions are audited; failed requests are not", async () => {
    await admin();
    vi.spyOn(cloudinaryService, "deleteAsset").mockResolvedValue(undefined as never);
    const id = Buffer.from("suntrix/file").toString("base64");
    expect((await request(app).delete(`/v1/upload/${id}`).set(auth)).status).toBe(200);
    await rows(1, { entity: "media", action: "delete" });

    // Unknown tracker → 404 → nothing recorded
    await request(app).post("/v1/tracker/admin/64b000000000000000000000/phase/advance").set(auth);
    await new Promise((r) => setTimeout(r, 50));
    expect(await AuditLog.countDocuments({ entity: "tracker" })).toBe(0);
  });

  it("sign-ins and failed sign-ins are audited without the password", async () => {
    await seedAdmin({ email: "owner@suntrix.test", password: "correct-horse-battery", name: "Owner" });
    const ip = "10.88.0.1";
    await request(app).post("/v1/auth/login").set("X-Forwarded-For", ip).send({ email: "owner@suntrix.test", password: "wrong-password-123" });
    await request(app).post("/v1/auth/login").set("X-Forwarded-For", ip).send({ email: "owner@suntrix.test", password: "correct-horse-battery" });
    const audit = await rows(2, { entity: "admin" });
    expect(audit.map((a) => a.action)).toEqual(["login_failed", "login"]);
    expect(audit[0].entityName).toBe("owner@suntrix.test");
    expect(JSON.stringify(audit)).not.toContain("wrong-password");
  });

  it("removing a subscriber is audited", async () => {
    await admin();
    const { default: Newsletter } = await import("../models/Newsletter");
    const sub = await Newsletter.create({ name: "R", email: "r@reader.test", interest: "AI", subscribed: true });
    await request(app).delete(`/v1/newsletter/${sub._id}`).set(auth);
    const [row] = await rows(1, { entity: "subscriber" });
    expect(row).toMatchObject({ action: "delete", entityName: "r@reader.test" });
  });

  it("the audit log is admin-only and caps page size at 200", async () => {
    await admin();
    await Testimonial.create({ name: "A", quote: "c", rating: 5 });
    const viewer = { Authorization: `Bearer ${await staffToken("viewer")}` };
    expect((await request(app).get("/v1/audit").set(viewer)).status).toBe(403);
    const spy = vi.spyOn(AuditLog, "find");
    expect((await request(app).get("/v1/audit?limit=100000").set(auth)).status).toBe(200);
    const query = spy.mock.results[0].value as { getOptions: () => { limit?: number } };
    expect(query.getOptions().limit).toBe(200);
  });
});
