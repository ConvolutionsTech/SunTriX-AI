import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import request from "supertest";
import app from "../app";
import SystemSetting from "../models/SystemSetting";
import SettingsVersion from "../models/SettingsVersion";
import { loadSettingsFromDB, refreshSettingsIfChanged, getSetting, bumpSettingsVersion, getSettingsStatus, isEnvOnlySetting } from "../lib/configLoader";
import { connectTestDb, clearTestDb, disconnectTestDb } from "./helpers/db";
import { staffToken } from "./helpers/auth";

describe("settings propagate across instances (T-OPA-10)", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120000);

  afterEach(async () => {
    await clearTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it("a change written by another instance is picked up on the next poll", async () => {
    await loadSettingsFromDB();
    expect(await refreshSettingsIfChanged()).toBe(false);

    // Another instance saves a setting and bumps the version
    await SystemSetting.updateOne({ key: "BRAND_NAME" }, { $set: { value: "Changed Elsewhere" } });
    expect(getSetting("BRAND_NAME")).not.toBe("Changed Elsewhere");
    const version = await bumpSettingsVersion();

    expect(await refreshSettingsIfChanged()).toBe(true);
    expect(getSetting("BRAND_NAME")).toBe("Changed Elsewhere");
    expect(getSettingsStatus().version).toBe(version);
    expect(await refreshSettingsIfChanged()).toBe(false);
  });

  it("saving through the API bumps the version; status is admin-only", async () => {
    await loadSettingsFromDB();
    const admin = { Authorization: `Bearer ${await staffToken("admin")}` };
    const res = await request(app).patch("/v1/settings/BRAND_NAME").set(admin).send({ value: "Acme" });
    expect(res.status).toBe(200);
    expect((await SettingsVersion.findById("settings"))?.version).toBe(1);

    const status = await request(app).get("/v1/settings/status").set(admin);
    expect(status.status).toBe(200);
    expect(status.body).toMatchObject({ instanceId: expect.any(String), version: expect.any(Number) });

    const viewer = { Authorization: `Bearer ${await staffToken("viewer")}` };
    expect((await request(app).get("/v1/settings/status").set(viewer)).status).toBe(403);
  });

  it("monitoring keys are env-only", () => {
    for (const key of ["SENTRY_DSN", "METRICS_TOKEN", "LOG_LEVEL"]) expect(isEnvOnlySetting(key)).toBe(true);
  });
});
