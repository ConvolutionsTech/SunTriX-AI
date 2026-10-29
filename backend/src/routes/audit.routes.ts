import { Router, Request, Response, NextFunction } from "express";
import AuditLog from "../models/AuditLog";
import { requireAuth, requireAdmin } from "../middleware/auth";

const router = Router();

// GET /audit — admin only, paginated (limit ≤ 200)
router.get("/", requireAuth, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { entity, action, limit = 50, skip = 0 } = req.query;
    const filter: Record<string, unknown> = {};
    if (typeof entity === "string" && entity) filter.entity = entity;
    if (typeof action === "string" && action) filter.action = action;
    const take = Math.min(Math.max(parseInt(String(limit)) || 50, 1), 200);
    const offset = Math.max(parseInt(String(skip)) || 0, 0);

    const logs = await AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(take)
      .skip(offset);

    const total = await AuditLog.countDocuments(filter);
    res.json({ logs, total });
  } catch (err) { next(err); }
});

export default router;
