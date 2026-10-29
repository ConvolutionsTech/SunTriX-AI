import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../app";
import SystemSetting from "../models/SystemSetting";
import AuditLog from "../models/AuditLog";
import { SETTINGS_REGISTRY, SETTINGS_BY_KEY } from "../config/settings.registry";
import { getSetting, updateSettingCache, isEnvOnlySetting, loadSettingsFromDB } from "../lib/configLoader";
import { connectTestDb, clearTestDb, disconnectTestDb } from "./helpers/db";

const token = (role: string) =>
  jwt.sign({ id: "507f1f77bcf86cd799439011", email: `${role}@suntrix.test`, role, name: role }, process.env.JWT_SECRET!);
const asAdmin = (req: request.Test) => req.set("Authorization", `Bearer ${token("admin")}`);

describe("settings registry coverage", () => {
  it("every getSetting key in the code is either a runtime setting or env-only", () => {
    const srcDir = path.resolve(__dirname, "..");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && entry.name !== "test") walk(full);
        else if (entry.name.endsWith(".ts")) files.push(full);
      }
    };
    walk(srcDir);

    const keys = new Set<string>();
    for (const file of files) {
      for (const m of fs.readFileSync(file, "utf8").matchAll(/getSetting\("([A-Z0-9_]+)"/g)) keys.add(m[1]);
    }
    const uncovered = [...keys].filter((k) => !SETTINGS_BY_KEY.has(k) && !isEnvOnlySetting(k));
    expect(uncovered).toEqual([]);
    expect(SETTINGS_REGISTRY.filter((d) => isEnvOnlySetting(d.key))).toEqual([]);
  });
});

describe("getSetting precedence", () => {
  afterEach(() => {
    delete process.env.BRAND_NAME;
  });

  it("DB value → environment → fallback, with empty values treated as unset", () => {
    updateSettingCache("BRAND_NAME", "");
    expect(getSetting("BRAND_NAME", "Default Co")).toBe("Default Co");
    process.env.BRAND_NAME = "Env Co";
    expect(getSetting("BRAND_NAME", "Default Co")).toBe("Env Co");
    updateSettingCache("BRAND_NAME", "DB Co");
    expect(getSetting("BRAND_NAME", "Default Co")).toBe("DB Co");
    updateSettingCache("BRAND_NAME", "");
  });
});

describe("settings API", () => {
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

  it("seeds every registry key, safely under concurrent boots", async () => {
    await Promise.all([loadSettingsFromDB(), loadSettingsFromDB()]);
    expect(await SystemSetting.countDocuments()).toBe(SETTINGS_REGISTRY.length);
  });

  it("lists every section for an admin and is closed to viewers", async () => {
    const res = await asAdmin(request(app).get("/v1/settings"));
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.grouped).sort()).toEqual(["ai", "brand", "chatbot", "email", "newsletter", "security", "storage"]);

    const viewer = await request(app).get("/v1/settings").set("Authorization", `Bearer ${token("viewer")}`);
    expect(viewer.status).toBe(403);
  });

  it("rejects unknown keys, env-only keys and invalid values", async () => {
    const unknown = await asAdmin(request(app).patch("/v1/settings/NOT_A_KEY")).send({ value: "x" });
    expect(unknown.status).toBe(400);
    expect(unknown.body.code).toBe("SETTING_UNKNOWN");

    const envOnly = await asAdmin(request(app).patch("/v1/settings/JWT_EXPIRY")).send({ value: "abc" });
    expect(envOnly.status).toBe(403);

    const invalid = await asAdmin(request(app).patch("/v1/settings/RATE_LIMIT_MAX")).send({ value: "0" });
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe("SETTING_INVALID");

    const toggle = await asAdmin(request(app).patch("/v1/settings/MAINTENANCE_MODE")).send({ value: "yes" });
    expect(toggle.status).toBe(400);
  });

  it("saves a valid value, hot-reloads it and audits the real before/after", async () => {
    await loadSettingsFromDB();
    const res = await asAdmin(request(app).patch("/v1/settings/BRAND_NAME")).send({ value: "Acme AI" });
    expect(res.status).toBe(200);
    expect(getSetting("BRAND_NAME")).toBe("Acme AI");

    await vi.waitFor(async () => expect(await AuditLog.countDocuments({ entityName: "BRAND_NAME" })).toBe(1));
    const audit = await AuditLog.findOne({ entityName: "BRAND_NAME" }).lean();
    expect(audit?.diff).toEqual({ oldValue: "", newValue: "Acme AI" });
    updateSettingCache("BRAND_NAME", "");
  });

  it("still saves when the audit write fails", async () => {
    vi.spyOn(AuditLog, "create").mockRejectedValue(new Error("audit down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await asAdmin(request(app).patch("/v1/settings/BRAND_TAGLINE")).send({ value: "We ship" });
    expect(res.status).toBe(200);
    expect((await SystemSetting.findOne({ key: "BRAND_TAGLINE" }))?.value).toBe("We ship");
    updateSettingCache("BRAND_TAGLINE", "");
  });

  it("bulk save reports per-key errors and saves the valid ones", async () => {
    const res = await asAdmin(request(app).patch("/v1/settings/bulk")).send({
      updates: [
        { key: "NEWSLETTER_BATCH_SIZE", value: "25" },
        { key: "STRIPE_SECRET_KEY", value: "sk_live_x" },
        { key: "NOPE", value: "1" },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.saved).toBe(1);
    expect(res.body.errors).toHaveLength(2);
    expect(await SystemSetting.findOne({ key: "STRIPE_SECRET_KEY" })).toBeNull();
    updateSettingCache("NEWSLETTER_BATCH_SIZE", "");
  });
});
