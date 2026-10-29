import { Router, Request, Response, NextFunction } from "express";
import Portfolio from "../models/Portfolio";
import { requireAuth, optionalAuth, AuthRequest } from "../middleware/auth";
import { createError } from "../middleware/errorHandler";
import { logAudit } from "../lib/audit";
import slugify from "slugify";

const router = Router();

// GET /portfolio  — public lists published; admin sees all
router.get("/", optionalAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Hidden/draft items only for a verified staff token — never for a bare Bearer header
    const showAll = !!req.user;
    const filter = showAll ? {} : { status: "published" };
    const projects = await Portfolio.find(filter).sort({ order: 1, createdAt: -1 });
    res.json(projects);
  } catch (err) { next(err); }
});

// GET /portfolio/slug/:slug  — public
router.get("/slug/:slug", optionalAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const project = await Portfolio.findOne({ slug: req.params.slug, ...(req.user ? {} : { status: "published" }) });
    if (!project) return next(createError("Project not found", 404));
    res.json(project);
  } catch (err) { next(err); }
});

// PUT /portfolio/reorder — admin bulk reorder
router.put("/reorder", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ids }: { ids: string[] } = req.body;
    if (!ids || !Array.isArray(ids)) return next(createError("Array of IDs required", 400));
    
    const updates = ids.map((id, index) => ({
      updateOne: { filter: { _id: id }, update: { order: index } }
    }));
    await Portfolio.bulkWrite(updates);
    await logAudit(req, "reorder", "portfolio", "", `Reordered ${ids.length} projects`);
    res.json({ message: "Reordered successfully" });
  } catch (err) { next(err); }
});

// DELETE /portfolio/bulk — admin bulk delete (must be before /:id)
router.delete("/bulk", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ids }: { ids: string[] } = req.body;
    if (!ids?.length) return next(createError("IDs required", 400));
    await Portfolio.deleteMany({ _id: { $in: ids } });
    await logAudit(req, "bulk_delete", "portfolio", "", `${ids.length} projects`);
    res.json({ message: `Deleted ${ids.length} projects` });
  } catch (err) { next(err); }
});

// PUT /portfolio/bulk — admin bulk update (must be before /:id)
router.put("/bulk", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ids, update }: { ids: string[]; update: Record<string, unknown> } = req.body;
    if (!ids?.length) return next(createError("IDs required", 400));
    await Portfolio.updateMany({ _id: { $in: ids } }, update);
    await logAudit(req, "bulk_update", "portfolio", "", `${ids.length} projects`);
    res.json({ message: `Updated ${ids.length} projects` });
  } catch (err) { next(err); }
});

// POST /portfolio/bulk/import — admin bulk import
router.post("/bulk/import", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { items } = req.body;
    if (!items || !Array.isArray(items)) return next(createError("Array of items required", 400));
    
    // Add default slugs
    const preparedItems = items.map((item: any) => ({
      ...item,
      slug: item.slug || slugify(item.title || "untitled", { lower: true, strict: true }) + "-" + Math.random().toString(36).slice(-4)
    }));

    const result = await Portfolio.insertMany(preparedItems);
    await logAudit(req, "bulk_import", "portfolio", "", `Imported ${result.length} projects`);
    res.status(201).json({ message: `Imported ${result.length} projects`, count: result.length });
  } catch (err) { next(err); }
});

// GET /portfolio/:id  — public
router.get("/:id", optionalAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const project = await Portfolio.findOne({ _id: req.params.id, ...(req.user ? {} : { status: "published" }) });
    if (!project) return next(createError("Project not found", 404));
    res.json(project);
  } catch (err) { next(err); }
});

// POST /portfolio  — admin only
router.post("/", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = { ...req.body };
    if (!body.slug) body.slug = slugify(body.title || "untitled", { lower: true, strict: true });
    const project = await Portfolio.create(body);
    await logAudit(req, "create", "portfolio", project._id.toString(), project.title);
    res.status(201).json(project);
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 11000) return next(createError("Slug must be unique", 409));
    next(err);
  }
});

// PUT /portfolio/:id  — admin only
router.put("/:id", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const project = await Portfolio.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!project) return next(createError("Project not found", 404));
    await logAudit(req, "update", "portfolio", project._id.toString(), project.title);
    res.json(project);
  } catch (err) { next(err); }
});

// DELETE /portfolio/:id  — admin only
router.delete("/:id", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const project = await Portfolio.findByIdAndDelete(req.params.id);
    if (!project) return next(createError("Project not found", 404));
    await logAudit(req, "delete", "portfolio", req.params.id, project.title);
    res.json({ message: "Project deleted" });
  } catch (err) { next(err); }
});

export default router;
