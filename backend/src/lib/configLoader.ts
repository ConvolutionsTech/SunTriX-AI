/**
 * configLoader.ts
 *
 * Central config layer. Two kinds of settings:
 *  - Env-only (secrets, deployment parameters): read from process.env only.
 *  - Runtime settings (SETTINGS_REGISTRY): stored in MongoDB, cached in memory,
 *    editable in Admin → Settings without a restart.
 *
 * Services call getSetting(key, fallback). Precedence for runtime settings:
 * DB value → environment → fallback; an empty value at any layer counts as unset.
 * The cache is per process; every instance polls SettingsVersion and reloads
 * within ~15 s of a change made on any other instance.
 */

import { randomUUID } from "crypto";
import SystemSetting from "../models/SystemSetting";
import SettingsVersion from "../models/SettingsVersion";
import { SETTINGS_REGISTRY, SETTINGS_BY_KEY } from "../config/settings.registry";
import { logger } from "./logger";

// ─── Env-only settings ─────────────────────────────────────────────────────
// Secrets and deployment parameters come from the environment only. DB rows for these
// keys are ignored at load time, and the settings API can neither read nor write them.
const ENV_ONLY_PREFIXES = ["JWT_", "STRIPE_", "CLOUDINARY_"];
const ENV_ONLY_KEYS = new Set([
  "RESEND_API_KEY", "GROQ_API_KEY", "MONGODB_URI", "FRONTEND_URL", "NODE_ENV", "PORT", "TRUST_PROXY",
  "LOG_LEVEL", "SENTRY_DSN", "METRICS_TOKEN", "GIT_SHA",
]);

export function isEnvOnlySetting(key: string): boolean {
  return ENV_ONLY_KEYS.has(key) || ENV_ONLY_PREFIXES.some((p) => key.startsWith(p));
}

/** Runtime settings seeded into the DB (kept for callers that list them). */
export const DEFAULT_SYSTEM_SETTINGS = SETTINGS_REGISTRY;

// ─── In-memory cache (key → value) ─────────────────────────────────────────
const cache: Record<string, string> = {};
const VERSION_ID = "settings";
const instanceId = randomUUID();
let loadedVersion: number | null = null;
let loadedAt: Date | null = null;

async function readVersion(): Promise<number> {
  const doc = await SettingsVersion.findById(VERSION_ID).lean();
  return doc?.version ?? 0;
}

/** Call after any settings write so other instances reload. */
export async function bumpSettingsVersion(): Promise<number> {
  const doc = await SettingsVersion.findByIdAndUpdate(VERSION_ID, { $inc: { version: 1 } }, { upsert: true, new: true }).lean();
  return doc!.version;
}

/** Reload the cache if another instance changed settings since we last loaded. */
export async function refreshSettingsIfChanged(): Promise<boolean> {
  const current = await readVersion();
  if (current === loadedVersion) return false;
  await loadSettingsFromDB();
  return true;
}

export function getSettingsStatus(): { instanceId: string; version: number | null; loadedAt: string | null } {
  return { instanceId, version: loadedVersion, loadedAt: loadedAt?.toISOString() ?? null };
}

const isSet = (v: string | undefined | null): v is string => v !== undefined && v !== null && v !== "";

// ─── Read a setting ────────────────────────────────────────────────────────
export function getSetting(key: string, fallback = ""): string {
  if (!isEnvOnlySetting(key) && isSet(cache[key])) return cache[key];
  if (isSet(process.env[key])) return process.env[key]!;
  return fallback;
}

// ─── Update the cache (called after a DB update) ───────────────────────────
export function updateSettingCache(key: string, value: string): void {
  if (isEnvOnlySetting(key)) {
    throw new Error(`${key} is env-only and cannot be changed at runtime`);
  }
  cache[key] = value;
}

// ─── Seed missing registry rows and load runtime settings into the cache ───
export async function loadSettingsFromDB(): Promise<void> {
  // 1. Seed: one atomic upsert per key, so concurrent boots can't collide.
  //    Metadata follows the registry; the value is only set on first insert.
  try {
    await SystemSetting.bulkWrite(
      SETTINGS_REGISTRY.map((def) => ({
        updateOne: {
          filter: { key: def.key },
          update: {
            $set: { section: def.section, label: def.label, description: def.description ?? "", type: def.type, options: def.options ?? [], isSecret: false },
            $setOnInsert: { key: def.key, value: process.env[def.key] || def.default },
          },
          upsert: true,
        },
      })),
      { ordered: false }
    );
  } catch (err) {
    logger.warn({ err }, "⚠️  Could not seed default settings");
  }

  // 2. Load runtime settings. A failure here must not prevent the seeding above,
  //    and vice versa; callers fall back to env/defaults for anything not cached.
  try {
    // Read the version first: a change landing mid-load bumps it again and triggers another reload.
    const version = await readVersion();
    const settings = await SystemSetting.find({}).lean();
    let loaded = 0;
    for (const s of settings) {
      if (isEnvOnlySetting(s.key)) {
        logger.warn(
          `⚠️  Ignoring DB value for env-only setting ${s.key}` +
            (process.env[s.key] ? "" : " — it is NOT set in the environment either")
        );
        continue;
      }
      if (!SETTINGS_BY_KEY.has(s.key)) {
        logger.warn(`⚠️  Ignoring unknown setting in DB: ${s.key}`);
        continue;
      }
      cache[s.key] = s.value ?? "";
      loaded++;
    }
    loadedVersion = version;
    loadedAt = new Date();
    logger.info(`✅ Loaded ${loaded} runtime settings from DB (version ${version})`);
  } catch (err) {
    logger.warn({ err }, "⚠️  Could not load settings from DB — using environment and defaults");
  }
}
