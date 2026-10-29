import { Router, Request, Response, NextFunction } from "express";
import CaseStudy from "../models/CaseStudy";
import { requireAuth, optionalAuth, AuthRequest } from "../middleware/auth";
import { createError } from "../middleware/errorHandler";
import { writable } from "../middleware/bodyPolicy";

const router = Router();

// GET /case-studies
router.get("/", optionalAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const studies = await CaseStudy.find(req.user ? {} : { status: "published" }).sort({ createdAt: -1 });
    res.json(studies);
  } catch (err) {
    next(err);
  }
});

// GET /case-studies/slug/:slug
router.get("/slug/:slug", optionalAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const study = await CaseStudy.findOne({ slug: req.params.slug, ...(req.user ? {} : { status: "published" }) }).populate("projectId");
    if (!study) return next(createError("Case study not found", 404));
    res.json(study);
  } catch (err) {
    next(err);
  }
});

// GET /case-studies/:id
router.get("/:id", optionalAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const study = await CaseStudy.findOne({ _id: req.params.id, ...(req.user ? {} : { status: "published" }) }).populate("projectId");
    if (!study) return next(createError("Case study not found", 404));
    res.json(study);
  } catch (err) {
    next(err);
  }
});

// POST /case-studies — admin
router.post("/", requireAuth, writable(CaseStudy), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const study = await CaseStudy.create(req.body);
    res.status(201).json(study);
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 11000) return next(createError("Slug must be unique", 409));
    next(err);
  }
});

// PUT /case-studies/:id — admin
router.put("/:id", requireAuth, writable(CaseStudy), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const study = await CaseStudy.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!study) return next(createError("Case study not found", 404));
    res.json(study);
  } catch (err) {
    next(err);
  }
});

// DELETE /case-studies/:id — admin
router.delete("/:id", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const study = await CaseStudy.findByIdAndDelete(req.params.id);
    if (!study) return next(createError("Case study not found", 404));
    res.json({ message: "Case study deleted" });
  } catch (err) {
    next(err);
  }
});

export default router;
