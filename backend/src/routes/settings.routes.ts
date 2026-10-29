import { Router, Response, NextFunction, Request } from "express";
import SystemSetting from "../models/SystemSetting";
import { requireAuth, requireAdmin, AuthRequest } from "../middleware/auth";
import { updateSettingCache, getSetting, isEnvOnlySetting } from "../lib/configLoader";
import AuditLog from "../models/AuditLog";
import { groqAdapter } from "../integrations/groq/groq.adapter";

const router = Router();

const MASKED = "••••••••••••";

// ─── GET /v1/settings/public — no auth — safe config for frontend ─
const PUBLIC_KEYS = [
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

// ─── GET /v1/settings — all settings grouped by section (secrets masked) ──
// Admin only — viewers have no access to configuration
router.get("/", requireAuth, requireAdmin, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const settings = await SystemSetting.find({}).sort({ section: 1, key: 1 }).lean();

    // Env-only keys (secrets) are never returned, even masked
    const sanitized = settings.filter((s) => !isEnvOnlySetting(s.key)).map((s) => ({
      ...s,
      value: s.isSecret && s.value ? MASKED : s.value,
    }));

    // Group by section for frontend convenience
    const grouped: Record<string, typeof sanitized> = {};
    for (const s of sanitized) {
      if (!grouped[s.section]) grouped[s.section] = [];
      grouped[s.section].push(s);
    }

    res.json({ settings: sanitized, grouped });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /v1/settings/bulk — save an entire section at once ─────────────
router.patch(
  "/bulk",
  requireAuth,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { updates } = req.body as { updates: { key: string; value: string }[] };

      if (!Array.isArray(updates) || updates.length === 0) {
        return res.status(400).json({ error: "updates must be a non-empty array" });
      }

      let saved = 0;
      const errors: string[] = [];

      for (const { key, value } of updates) {
        // Skip if the admin sent back the masked placeholder for a secret field
        if (value === MASKED) continue;

        if (isEnvOnlySetting(key)) {
          errors.push(`${key}: set via environment, not the settings API`);
          continue;
        }

        // Model selection validation against discovered catalog
        if (key === "GROQ_CHAT_MODEL" || key === "GROQ_EXTRACT_MODEL") {
          const check = await groqAdapter.validateModelAvailability(String(value));
          if (!check.isValid) {
            errors.push(`${key}: ${check.message}`);
            continue;
          }
        }

        try {
          const setting = await SystemSetting.findOneAndUpdate(
            { key },
            { $set: { value: String(value), updatedBy: req.user?.id } },
            { upsert: true, new: true }
          );

          if (setting) {
            updateSettingCache(key, String(value));
            saved++;

            // Create audit log for this setting change
            await AuditLog.create({
              action: "update",
              entity: "setting",
              entityId: setting._id,
              entityName: key,
              adminId: req.user?.id || "system",
              adminName: req.user?.name || "System",
              diff: {
                oldValue: setting.isSecret ? MASKED : setting.value,
                newValue: setting.isSecret ? MASKED : String(value),
              },
            });
          }
        } catch (e: any) {
          errors.push(`${key}: ${e.message}`);
        }
      }

      if (saved === 0 && errors.length > 0) {
        return res.status(400).json({ error: errors.join("; "), saved: 0, errors });
      }

      res.json({ saved, errors: errors.length ? errors : undefined });
    } catch (err) {
      next(err);
    }
  }
);

// ─── PATCH /v1/settings/:key — update a single setting ────────────────────
router.patch(
  "/:key",
  requireAuth,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { key } = req.params;
      const { value } = req.body as { value: string };

      if (isEnvOnlySetting(key)) {
        return res.status(403).json({ error: `${key} must be set via environment, not the settings API` });
      }

      if (value === undefined || value === null) {
        return res.status(400).json({ error: "value is required" });
      }

      // Reject if user sent back the masked placeholder
      if (String(value) === MASKED) {
        return res.status(400).json({ error: "Provide a real value, not the masked placeholder" });
      }

      // Model selection validation against discovered catalog
      if (key === "GROQ_CHAT_MODEL" || key === "GROQ_EXTRACT_MODEL") {
        const check = await groqAdapter.validateModelAvailability(String(value));
        if (!check.isValid) {
          return res.status(400).json({ error: check.message });
        }
      }

      const setting = await SystemSetting.findOneAndUpdate(
        { key },
        { $set: { value: String(value), updatedBy: req.user?.id } },
        { upsert: true, new: true }
      );

      // Hot-reload immediately — no restart required
      updateSettingCache(key, String(value));

      // Create audit log
      await AuditLog.create({
        action: "update",
        entity: "setting",
        entityId: setting._id,
        entityName: key,
        adminId: req.user?.id || "system",
        adminName: req.user?.name || "System",
        diff: {
          oldValue: setting.isSecret ? MASKED : setting.value,
          newValue: setting.isSecret ? MASKED : String(value),
        },
      });

      res.json({ setting });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
