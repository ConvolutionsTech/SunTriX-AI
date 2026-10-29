import { Router, Request, Response, NextFunction } from "express";
import Testimonial from "../models/Testimonial";
import { requireAuth, optionalAuth, AuthRequest } from "../middleware/auth";
import { createError } from "../middleware/errorHandler";
import { writable } from "../middleware/bodyPolicy";

const router = Router();

// GET /testimonials — public
router.get("/", optionalAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const isAdmin = !!req.user;
    const filter = isAdmin ? {} : { status: "published" };
    const testimonials = await Testimonial.find(filter).sort({ createdAt: -1 });
    res.json(testimonials);
  } catch (err) {
    next(err);
  }
});

// POST /testimonials — admin
router.post("/", requireAuth, writable(Testimonial), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const t = await Testimonial.create(req.body);
    res.status(201).json(t);
  } catch (err) {
    next(err);
  }
});

// PUT /testimonials/:id — admin
router.put("/:id", requireAuth, writable(Testimonial), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const t = await Testimonial.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!t) return next(createError("Testimonial not found", 404));
    res.json(t);
  } catch (err) {
    next(err);
  }
});

// DELETE /testimonials/:id — admin
router.delete("/:id", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const t = await Testimonial.findByIdAndDelete(req.params.id);
    if (!t) return next(createError("Testimonial not found", 404));
    res.json({ message: "Testimonial deleted" });
  } catch (err) {
    next(err);
  }
});

export default router;
