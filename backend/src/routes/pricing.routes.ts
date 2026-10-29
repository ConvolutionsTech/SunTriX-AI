import { Router, Request, Response, NextFunction } from "express";
import Pricing from "../models/Pricing";
import { requireAuth, optionalAuth, AuthRequest } from "../middleware/auth";
import { createError } from "../middleware/errorHandler";
import { writable, idsBody, bulkItems } from "../middleware/bodyPolicy";
import { logAudit } from "../lib/audit";

// Curated lists stay small; the cap only guards against runaway data
const MAX_LIST = 500;

const router = Router();

// GET /pricing — public (enabled only) or admin all
router.get("/", optionalAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Hidden/draft items only for a verified staff token — never for a bare Bearer header
    const showAll = !!req.user;
    const filter = showAll ? {} : { isVisible: true };
    const plans = await Pricing.find(filter).sort({ order: 1 }).limit(MAX_LIST);
    res.json({ plans });
  } catch (err) { next(err); }
});

// PUT /pricing/reorder — admin bulk reorder
router.put("/reorder", requireAuth, idsBody, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ids }: { ids: string[] } = req.body;
    if (!ids || !Array.isArray(ids)) return next(createError("Array of IDs required", 400));
    
    const updates = ids.map((id, index) => ({
      updateOne: { filter: { _id: id }, update: { order: index } }
    }));
    await Pricing.bulkWrite(updates);
    await logAudit(req, "reorder", "pricing", "", `Reordered ${ids.length} plans`);
    res.json({ message: "Reordered successfully" });
  } catch (err) { next(err); }
});

// DELETE /pricing/bulk — admin bulk delete
router.delete("/bulk", requireAuth, idsBody, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ids }: { ids: string[] } = req.body;
    if (!ids?.length) return next(createError("IDs required", 400));
    await Pricing.deleteMany({ _id: { $in: ids } });
    await logAudit(req, "bulk_delete", "pricing", "", `${ids.length} plans`);
    res.json({ message: `Deleted ${ids.length} plans` });
  } catch (err) { next(err); }
});

// POST /pricing/bulk/import — admin bulk import
router.post("/bulk/import", requireAuth, bulkItems(Pricing), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { items } = req.body;
    if (!items || !Array.isArray(items)) return next(createError("Array of items required", 400));
    
    const result = await Pricing.insertMany(items);
    await logAudit(req, "bulk_import", "pricing", "", `Imported ${result.length} plans`);
    res.status(201).json({ message: `Imported ${result.length} plans`, count: result.length });
  } catch (err) { next(err); }
});

// POST /pricing — admin
router.post("/", requireAuth, writable(Pricing), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const plan = await Pricing.create(req.body);
    await logAudit(req, "create", "pricing", plan._id.toString(), plan.name);
    res.status(201).json(plan);
  } catch (err) { next(err); }
});

// PUT /pricing/:id — admin
router.put("/:id", requireAuth, writable(Pricing), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const plan = await Pricing.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!plan) return next(createError("Pricing plan not found", 404));
    await logAudit(req, "update", "pricing", plan._id.toString(), plan.name);
    res.json(plan);
  } catch (err) { next(err); }
});

// DELETE /pricing/:id — admin
router.delete("/:id", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const plan = await Pricing.findByIdAndDelete(req.params.id);
    if (!plan) return next(createError("Pricing plan not found", 404));
    await logAudit(req, "delete", "pricing", req.params.id, plan.name);
    res.json({ message: "Pricing plan deleted" });
  } catch (err) { next(err); }
});

export default router;
