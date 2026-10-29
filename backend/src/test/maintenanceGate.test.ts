import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import request from "supertest";
import app from "../app";
import { updateSettingCache } from "../lib/configLoader";
import { connectTestDb, disconnectTestDb } from "./helpers/db";
import { staffToken } from "./helpers/auth";

describe("maintenance mode (T-OPB-20)", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120000);

  afterEach(() => {
    updateSettingCache("MAINTENANCE_MODE", "");
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it("public API calls get a 503 with a code; probes, sign-in and capability links keep working", async () => {
    updateSettingCache("MAINTENANCE_MODE", "true");
    const blocked = await request(app).get("/v1/posts");
    expect(blocked.status).toBe(503);
    expect(blocked.body).toMatchObject({ code: "MAINTENANCE", maintenanceMode: true });

    expect((await request(app).get("/health")).status).toBe(200);
    expect((await request(app).post("/v1/auth/login").set("X-Forwarded-For", "10.120.0.1").send({})).status).not.toBe(503);
    expect((await request(app).get("/v1/proposals/view/prop_missing")).status).not.toBe(503);
    expect((await request(app).post("/v1/payments/webhook").set("Content-Type", "application/json").send("{}")).status).not.toBe(503);
  });

  it("staff with a valid session can still use the site; a forged token can't", async () => {
    updateSettingCache("MAINTENANCE_MODE", "true");
    const staff = await request(app).get("/v1/posts").set("Authorization", `Bearer ${await staffToken("viewer")}`);
    expect(staff.status).toBe(200);
    expect((await request(app).get("/v1/posts").set("Authorization", "Bearer not.a.jwt")).status).toBe(503);
  });

  it("is off by default", async () => {
    expect((await request(app).get("/v1/posts")).status).toBe(200);
  });
});
