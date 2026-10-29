import { Router, Request, Response, NextFunction } from "express";
import Team from "../models/Team";
import { requireAuth, optionalAuth, AuthRequest } from "../middleware/auth";
import { createError } from "../middleware/errorHandler";
import { writable, idsBody, bulkItems } from "../middleware/bodyPolicy";
import { logAudit } from "../lib/audit";

// Curated lists stay small; the cap only guards against runaway data
const MAX_LIST = 500;

const router = Router();

// GET /team — public (visible only)
router.get("/", optionalAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Hidden/draft items only for a verified staff token — never for a bare Bearer header
    const showAll = !!req.user;
    const filter = showAll ? {} : { isVisible: true };
    const members = await Team.find(filter).sort({ order: 1, createdAt: 1 }).limit(MAX_LIST);
    res.json(members);
  } catch (err) { next(err); }
});

// PUT /team/reorder — admin bulk reorder
router.put("/reorder", requireAuth, idsBody, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ids }: { ids: string[] } = req.body;
    if (!ids || !Array.isArray(ids)) return next(createError("Array of IDs required", 400));
    
    const updates = ids.map((id, index) => ({
      updateOne: { filter: { _id: id }, update: { order: index } }
    }));
    await Team.bulkWrite(updates);
    await logAudit(req, "reorder", "team", "", `Reordered ${ids.length} members`);
    res.json({ message: "Reordered successfully" });
  } catch (err) { next(err); }
});

// DELETE /team/bulk — admin bulk delete
router.delete("/bulk", requireAuth, idsBody, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ids }: { ids: string[] } = req.body;
    if (!ids?.length) return next(createError("IDs required", 400));
    await Team.deleteMany({ _id: { $in: ids } });
    await logAudit(req, "bulk_delete", "team", "", `${ids.length} members`);
    res.json({ message: `Deleted ${ids.length} members` });
  } catch (err) { next(err); }
});

// POST /team/bulk/import — admin bulk import
router.post("/bulk/import", requireAuth, bulkItems(Team), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { items } = req.body;
    if (!items || !Array.isArray(items)) return next(createError("Array of items required", 400));
    
    const result = await Team.insertMany(items);
    await logAudit(req, "bulk_import", "team", "", `Imported ${result.length} members`);
    res.status(201).json({ message: `Imported ${result.length} members`, count: result.length });
  } catch (err) { next(err); }
});

// GET /team/:id — admin
router.get("/:id", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const member = await Team.findById(req.params.id);
    if (!member) return next(createError("Team member not found", 404));
    res.json(member);
  } catch (err) { next(err); }
});

// POST /team — admin
router.post("/", requireAuth, writable(Team), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const member = await Team.create(req.body);
    await logAudit(req, "create", "team", member._id.toString(), member.name);
    res.status(201).json(member);
  } catch (err) { next(err); }
});

// PUT /team/:id — admin
router.put("/:id", requireAuth, writable(Team), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const member = await Team.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!member) return next(createError("Team member not found", 404));
    await logAudit(req, "update", "team", member._id.toString(), member.name);
    res.json(member);
  } catch (err) { next(err); }
});

// DELETE /team/:id — admin
router.delete("/:id", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const member = await Team.findByIdAndDelete(req.params.id);
    if (!member) return next(createError("Team member not found", 404));
    await logAudit(req, "delete", "team", req.params.id, member.name);
    res.json({ message: "Team member deleted" });
  } catch (err) { next(err); }
});

export default router;
