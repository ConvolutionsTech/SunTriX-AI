import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import app from "../app";
import Admin from "../models/Admin";
import * as email from "../services/email";
import { seedAdmin } from "../scripts/seedAdmin";
import { forgetTokenVersion } from "../lib/tokens";
import { connectTestDb, clearTestDb, disconnectTestDb } from "./helpers/db";

const owner = { email: "owner@suntrix.test", password: "correct-horse-battery", name: "Owner" };
let ip = 0;
// Distinct client per request so the 5-per-15-min auth limiter doesn't interfere
const client = () => `198.51.100.${++ip % 250}`;

async function login(creds = owner) {
  const res = await request(app).post("/v1/auth/login").set("X-Forwarded-For", client()).send(creds);
  expect(res.status).toBe(200);
  return res.body as { token: string; refreshToken: string; user: { id: string } };
}
const refresh = (refreshToken: string) =>
  request(app).post("/v1/auth/refresh").set("X-Forwarded-For", client()).send({ refreshToken });
const me = (token: string) => request(app).get("/v1/auth/me").set("Authorization", `Bearer ${token}`);
const asUser = (token: string) => ({ Authorization: `Bearer ${token}` });

describe("admin session lifecycle (A14)", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120000);

  beforeEach(async () => {
    await clearTestDb();
    await seedAdmin(owner);
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it("issues short-lived access tokens and rotating refresh tokens", async () => {
    const s = await login();
    expect((await me(s.token)).status).toBe(200);

    const r1 = await refresh(s.refreshToken);
    expect(r1.status).toBe(200);
    expect(r1.body.refreshToken).not.toBe(s.refreshToken);
    expect((await me(r1.body.token)).status).toBe(200);
  });

  it("tolerates two tabs refreshing at the same moment", async () => {
    const s = await login();
    const [a, b] = await Promise.all([refresh(s.refreshToken), refresh(s.refreshToken)]);
    expect([a.status, b.status]).toEqual([200, 200]);
  });

  it("treats reuse of an old refresh token as theft and ends every session", async () => {
    const s = await login();
    const rotated = await refresh(s.refreshToken);
    expect(rotated.status).toBe(200);

    // Pretend the grace window has passed
    await Admin.updateOne({ email: owner.email }, { $set: { "refreshTokens.$[].rotatedAt": new Date(Date.now() - 60_000) } });
    expect((await refresh(s.refreshToken)).status).toBe(401);

    // The legitimate session's newer tokens are revoked as well
    expect((await refresh(rotated.body.refreshToken)).status).toBe(401);
    expect((await me(rotated.body.token)).status).toBe(401);
  });

  it("logout revokes access and refresh tokens", async () => {
    const s = await login();
    expect((await request(app).post("/v1/auth/logout").set(asUser(s.token))).status).toBe(200);
    expect((await me(s.token)).status).toBe(401);
    expect((await refresh(s.refreshToken)).status).toBe(401);
  });

  it("changing the password signs out other sessions but keeps the current one", async () => {
    const other = await login();
    const current = await login();

    const res = await request(app)
      .post("/v1/auth/password")
      .set(asUser(current.token))
      .send({ currentPassword: owner.password, newPassword: "a-much-longer-new-password" });
    expect(res.status).toBe(200);

    expect((await me(other.token)).status).toBe(401);
    expect((await refresh(other.refreshToken)).status).toBe(401);
    expect((await me(res.body.token)).status).toBe(200);
    await login({ ...owner, password: "a-much-longer-new-password" });
  });

  it("rejects a wrong current password", async () => {
    const s = await login();
    const res = await request(app).post("/v1/auth/password").set(asUser(s.token)).send({ currentPassword: "nope-nope-nope", newPassword: "another-long-password" });
    expect(res.status).toBe(400);
  });

  it("password reset: same response for unknown emails, single-use link, ends sessions", async () => {
    const send = vi.spyOn(email, "sendPasswordResetEmail").mockResolvedValue();
    const s = await login();

    const unknown = await request(app).post("/v1/auth/forgot").set("X-Forwarded-For", client()).send({ email: "nobody@suntrix.test" });
    const known = await request(app).post("/v1/auth/forgot").set("X-Forwarded-For", client()).send({ email: owner.email });
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
    expect(send).toHaveBeenCalledTimes(1);

    const resetToken = send.mock.calls[0][0].resetUrl.split("/").pop()!;
    const reset = await request(app).post(`/v1/auth/reset/${resetToken}`).set("X-Forwarded-For", client()).send({ password: "brand-new-password-123" });
    expect(reset.status).toBe(200);

    const again = await request(app).post(`/v1/auth/reset/${resetToken}`).set("X-Forwarded-For", client()).send({ password: "another-password-12345" });
    expect(again.status).toBe(400);
    expect((await me(s.token)).status).toBe(401);
    await login({ ...owner, password: "brand-new-password-123" });
    vi.restoreAllMocks();
  });

  it("a deleted admin's token stops working", async () => {
    const s = await login();
    await Admin.deleteOne({ email: owner.email });
    forgetTokenVersion(s.user.id); // other instances notice within the 60 s cache window
    expect((await me(s.token)).status).toBe(401);
  });
});

describe("admin user management", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120000);

  beforeEach(async () => {
    await clearTestDb();
    await seedAdmin(owner);
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it("creates, renames, changes role and deletes users", async () => {
    const { token, user } = await login();
    const create = await request(app)
      .post("/v1/admin/users")
      .set(asUser(token))
      .send({ email: "viewer@suntrix.test", name: "Vee", role: "viewer", password: "viewer-password-123" });
    expect(create.status).toBe(201);
    const id = create.body.user.id;

    const list = await request(app).get("/v1/admin/users").set(asUser(token));
    expect(list.body.users.map((u: { email: string }) => u.email).sort()).toEqual(["owner@suntrix.test", "viewer@suntrix.test"]);
    expect(JSON.stringify(list.body)).not.toMatch(/password|refreshTokens/);

    const viewer = await login({ email: "viewer@suntrix.test", password: "viewer-password-123", name: "" });
    expect((await request(app).get("/v1/admin/users").set(asUser(viewer.token))).status).toBe(403);

    // Promotion takes effect and invalidates the viewer's old token
    expect((await request(app).patch(`/v1/admin/users/${id}`).set(asUser(token)).send({ role: "admin" })).status).toBe(200);
    expect((await me(viewer.token)).status).toBe(401);

    expect((await request(app).delete(`/v1/admin/users/${user.id}`).set(asUser(token))).status).toBe(409); // self
    expect((await request(app).delete(`/v1/admin/users/${id}`).set(asUser(token))).status).toBe(200);
  });

  it("never removes or demotes the last admin", async () => {
    const { token, user } = await login();
    const demote = await request(app).patch(`/v1/admin/users/${user.id}`).set(asUser(token)).send({ role: "viewer" });
    expect(demote.status).toBe(409);
    expect((await Admin.findById(user.id))?.role).toBe("admin");
  });

  it("rejects duplicate emails and weak passwords", async () => {
    const { token } = await login();
    const dup = await request(app).post("/v1/admin/users").set(asUser(token)).send({ email: owner.email, name: "X", role: "viewer", password: "long-enough-password" });
    expect(dup.status).toBe(409);
    const weak = await request(app).post("/v1/admin/users").set(asUser(token)).send({ email: "w@suntrix.test", name: "W", role: "viewer", password: "short" });
    expect(weak.status).toBe(400);
  });
});
