import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import app from "../app";
import Admin from "../models/Admin";
import { seedAdmin } from "../scripts/seedAdmin";
import { connectTestDb, clearTestDb, disconnectTestDb } from "./helpers/db";

const creds = { email: "Owner@Suntrix.test", password: "correct-horse-battery", name: "Owner" };

describe("First-admin bootstrap (seedAdmin)", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120000);

  afterEach(async () => {
    await clearTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it("creates the admin once and is idempotent on re-run", async () => {
    expect(await seedAdmin(creds)).toEqual({ created: true, email: "owner@suntrix.test" });
    expect(await seedAdmin(creds)).toEqual({ created: false, email: "owner@suntrix.test" });

    const admins = await Admin.find({});
    expect(admins).toHaveLength(1);
    expect(admins[0].role).toBe("admin");
    expect(admins[0].password).not.toBe(creds.password);
  });

  it("lets the seeded admin log in over HTTP", async () => {
    await seedAdmin(creds);
    const res = await request(app).post("/v1/auth/login").send({ email: creds.email, password: creds.password });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.role).toBe("admin");
  });

  it.each([
    [{ ...creds, email: "" }, /ADMIN_SEED_EMAIL is required/],
    [{ ...creds, password: "short-pass" }, /at least 12 characters/],
    [{ ...creds, password: "your_secure_password" }, /known weak password/],
  ])("rejects unsafe input %#", async (input, message) => {
    await expect(seedAdmin(input)).rejects.toThrow(message);
    expect(await Admin.countDocuments()).toBe(0);
  });

  it("enforces a 12-character minimum on new admin passwords at the model level", async () => {
    await expect(Admin.create({ email: "x@suntrix.test", password: "elevenchars", name: "X" })).rejects.toThrow();
  });
});
