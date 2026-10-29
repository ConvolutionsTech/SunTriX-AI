import { Router, Response, NextFunction, Request } from "express";
import SystemSetting from "../models/SystemSetting";
import { requireAuth, requireAdmin, AuthRequest } from "../middleware/auth";
import { updateSettingCache, getSetting, isEnvOnlySetting, bumpSettingsVersion, getSettingsStatus } from "../lib/configLoader";
import { SETTINGS_REGISTRY, SETTINGS_BY_KEY } from "../config/settings.registry";
import AuditLog from "../models/AuditLog";
import { groqAdapter } from "../integrations/groq/groq.adapter";
import { logger } from "../lib/logger";

const router = Router();

// ─── GET /v1/settings/public — no auth — safe config for frontend ─
const PUBLIC_KEYS = [
  "AI_ENABLED",
  "CHATBOT_ENABLED",
  "CHATBOT_NAME",
  "CHATBOT_WELCOME_MESSAGE",
  "CHATBOT_MAX_WORDS",
  "BRAND_NAME",
  "BRAND_EMAIL",
  "BRAND_TAGLINE",
  "BRAND_RESPONSE_TIME",
  "BRAND_PROPOSAL_GUARANTEE",
  "MAINTENANCE_MODE",
];

router.get("/public", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result: Record<string, string> = {};
    for (const key of PUBLIC_KEYS) {
      result[key] = getSetting(key);
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── GET /v1/settings/ai/models — dynamically discover available Groq models ─
router.get("/ai/models", requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    const models = await groqAdapter.listAvailableModels({ forceRefresh });
    res.json({
      models,
      selectedChatModel: getSetting("GROQ_CHAT_MODEL", "llama-3.1-8b-instant"),
      selectedExtractModel: getSetting("GROQ_EXTRACT_MODEL", "llama-3.1-8b-instant"),
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /v1/settings — every runtime setting, grouped by section (admin only) ──
// Env-only keys (secrets, deployment parameters) are never stored or returned.
router.get("/", requireAuth, requireAdmin, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const rows = await SystemSetting.find({ key: { $in: SETTINGS_REGISTRY.map((d) => d.key) } }).lean();
    const stored = new Map(rows.map((r) => [r.key, r]));

    // Registry order; a key not seeded yet still appears with its default
    const settings = SETTINGS_REGISTRY.map((def) => ({
      _id: stored.get(def.key)?._id ?? def.key,
      key: def.key,
      value: stored.get(def.key)?.value ?? def.default,
      section: def.section,
      label: def.label,
      description: def.description ?? "",
      type: def.type,
      options: def.options ?? [],
      isSecret: false,
    }));

    const grouped: Record<string, typeof settings> = {};
    for (const s of settings) (grouped[s.section] ||= []).push(s);

    res.json({ settings, grouped });
  } catch (err) {
    next(err);
  }
});

// ─── Shared: validate and save one setting ──────────────────────────────────
class SettingError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function saveSetting(key: string, rawValue: unknown, user: AuthRequest["user"]): Promise<{ warning?: string }> {
  if (isEnvOnlySetting(key)) {
    throw new SettingError(403, "SETTING_ENV_ONLY", `${key} must be set via environment, not the settings API`);
  }
  const def = SETTINGS_BY_KEY.get(key);
  if (!def) throw new SettingError(400, "SETTING_UNKNOWN", `Unknown setting: ${key}`);
  if (rawValue === undefined || rawValue === null) throw new SettingError(400, "SETTING_INVALID", `${key}: value is required`);

  const parsed = def.schema.safeParse(String(rawValue).trim());
  if (!parsed.success) {
    throw new SettingError(400, "SETTING_INVALID", `${key}: ${parsed.error.issues[0]?.message ?? "invalid value"}`);
  }
  const value = parsed.data;

  // Model selection: check against the Groq catalog, but don't block saving when Groq is unreachable
  let warning: string | undefined;
  if (def.type === "select" && key.startsWith("GROQ_")) {
    const check = await groqAdapter.validateModelAvailability(value);
    if (!check.isValid && !check.unverifiable) throw new SettingError(400, "SETTING_INVALID", `${key}: ${check.message}`);
    if (check.unverifiable) warning = `${key} saved but not verified: ${check.message}`;
  }

  const before = await SystemSetting.findOne({ key }).lean();
  await SystemSetting.findOneAndUpdate(
    { key },
    {
      $set: { value, updatedBy: user?.id },
      $setOnInsert: { key, section: def.section, label: def.label, description: def.description ?? "", type: def.type, options: def.options ?? [] },
    },
    { upsert: true, runValidators: true }
  );
  updateSettingCache(key, value);
  // Other instances poll this version and reload within ~15 s
  await bumpSettingsVersion();

  // The change is already saved; an audit failure must not turn it into an error
  AuditLog.create({
    action: "update",
    entity: "setting",
    entityId: key,
    entityName: key,
    adminId: user?.id || "system",
    adminName: user?.name || "System",
    diff: { oldValue: before?.value ?? def.default, newValue: value },
  }).catch((err) => logger.error({ err, key }, "Audit log write failed for setting"));

  return { warning };
}

// ─── GET /v1/settings/status — which settings version this instance serves ─
router.get("/status", requireAuth, requireAdmin, (_req: AuthRequest, res: Response) => {
  res.json(getSettingsStatus());
});

// ─── PATCH /v1/settings/bulk — save an entire section at once ─────────────
router.patch("/bulk", requireAuth, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { updates } = req.body as { updates: { key: string; value: string }[] };
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ error: "updates must be a non-empty array" });
    }

    let saved = 0;
    const errors: string[] = [];
    const warnings: string[] = [];
    for (const { key, value } of updates) {
      try {
        const { warning } = await saveSetting(key, value, req.user);
        if (warning) warnings.push(warning);
        saved++;
      } catch (e) {
        errors.push(e instanceof SettingError ? e.message : `${key}: ${(e as Error).message}`);
      }
    }

    if (saved === 0 && errors.length > 0) {
      return res.status(400).json({ error: errors.join("; "), saved: 0, errors });
    }
    res.json({ saved, errors: errors.length ? errors : undefined, warnings: warnings.length ? warnings : undefined });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /v1/settings/:key — update a single setting ────────────────────
router.patch("/:key", requireAuth, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { key } = req.params;
    const { warning } = await saveSetting(key, (req.body as { value?: unknown }).value, req.user);
    res.json({ key, value: getSetting(key), warning });
  } catch (err) {
    if (err instanceof SettingError) return res.status(err.status).json({ error: err.message, code: err.code });
    next(err);
  }
});

export default router;
