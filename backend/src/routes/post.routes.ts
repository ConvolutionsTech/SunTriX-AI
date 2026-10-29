import { Router, Request, Response, NextFunction } from "express";
import Post from "../models/Post";
import { requireAuth, optionalAuth, AuthRequest } from "../middleware/auth";
import { createError } from "../middleware/errorHandler";
import { writable, idsBody, bulkItems, bulkUpdate } from "../middleware/bodyPolicy";
import { logAudit } from "../lib/audit";
import slugify from "slugify";
import sanitizeHtml from "sanitize-html";
import { pageParams } from "../middleware/pagination";

const sanitizeOptions = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat([
    "img", "h1", "h2", "h3", "h4", "h5", "h6", "span", "u", "s"
  ]),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    "a": ["href", "name", "target", "rel"],
    "img": ["src", "alt", "title", "width", "height"],
    "span": ["style", "class"],
    "p": ["style", "class"]
  }
};

const router = Router();

// GET /posts — public: published posts with filters
router.get("/", optionalAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { tag, category, featured, all } = req.query;
    const { limit, skip } = pageParams(req, { defaultLimit: 20, maxLimit: 100 });
    const filter: Record<string, unknown> = req.user && all === "true" ? {} : { status: "published" };
    if (tag) filter.tags = tag;
    if (category) filter.category = category;
    if (featured === "true") filter.featured = true;

    const posts = await Post.find(filter)
      .sort({ publishedAt: -1, createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .select("-content"); // Exclude full content in list view

    const total = await Post.countDocuments(filter);
    res.json({ posts, total });
  } catch (err) { next(err); }
});

// GET /posts/slug/:slug — public single post (increments views)
router.get("/slug/:slug", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const post = await Post.findOneAndUpdate(
      { slug: req.params.slug, status: "published" },
      { $inc: { views: 1 } },
      { new: true }
    );
    if (!post) return next(createError("Post not found", 404));
    res.json(post);
  } catch (err) { next(err); }
});

// GET /posts/:id — admin single post by ID
router.get("/:id", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return next(createError("Post not found", 404));
    res.json(post);
  } catch (err) { next(err); }
});

// POST /posts — admin
router.post("/", requireAuth, writable(Post, { protect: ["views"] }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = { ...req.body };
    if (!data.slug && data.title) {
      data.slug = slugify(data.title, { lower: true, strict: true });
    }
    if (data.status === "published" && !data.publishedAt) {
      data.publishedAt = new Date();
    }
    if (data.content) {
      data.content = sanitizeHtml(data.content, sanitizeOptions);
    }
    const post = await Post.create(data);
    await logAudit(req, "create", "post", post._id.toString(), post.title);
    res.status(201).json(post);
  } catch (err) { next(err); }
});

// DELETE /posts/bulk — bulk delete
router.delete("/bulk", requireAuth, idsBody, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ids }: { ids: string[] } = req.body;
    if (!ids?.length) return next(createError("IDs required", 400));
    await Post.deleteMany({ _id: { $in: ids } });
    await logAudit(req, "bulk_delete", "post", "", `${ids.length} posts`);
    res.json({ message: `Deleted ${ids.length} posts` });
  } catch (err) { next(err); }
});

// PUT /posts/bulk — bulk status update
router.put("/bulk", requireAuth, bulkUpdate(["status", "featured", "category"]), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ids, update }: { ids: string[]; update: Record<string, unknown> } = req.body;
    if (!ids?.length) return next(createError("IDs required", 400));
    if (update.status === "published") update.publishedAt = new Date();
    await Post.updateMany({ _id: { $in: ids } }, update, { runValidators: true });
    await logAudit(req, "bulk_update", "post", "", `${ids.length} posts`);
    res.json({ message: `Updated ${ids.length} posts` });
  } catch (err) { next(err); }
});

// PUT /posts/:id — admin
router.put("/:id", requireAuth, writable(Post, { protect: ["views"] }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = { ...req.body };
    if (data.status === "published" && !data.publishedAt) {
      data.publishedAt = new Date();
    }
    if (data.content) {
      data.content = sanitizeHtml(data.content, sanitizeOptions);
    }
    const post = await Post.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
    if (!post) return next(createError("Post not found", 404));
    await logAudit(req, "update", "post", post._id.toString(), post.title);
    res.json(post);
  } catch (err) { next(err); }
});

// DELETE /posts/:id — admin
router.delete("/:id", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const post = await Post.findByIdAndDelete(req.params.id);
    if (!post) return next(createError("Post not found", 404));
    await logAudit(req, "delete", "post", req.params.id, post.title);
    res.json({ message: "Post deleted" });
  } catch (err) { next(err); }
});



// POST /posts/bulk/import — bulk import
router.post("/bulk/import", requireAuth, bulkItems(Post, { protect: ["views"] }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { items } = req.body;
    if (!items || !Array.isArray(items)) return next(createError("Array of items required", 400));
    
    const preparedItems = items.map((item: any) => {
      const data = { ...item };
      if (!data.slug && data.title) {
        data.slug = slugify(data.title, { lower: true, strict: true }) + "-" + Math.random().toString(36).slice(-4);
      }
      if (data.status === "published" && !data.publishedAt) {
        data.publishedAt = new Date();
      }
      if (data.content) {
        data.content = sanitizeHtml(data.content, sanitizeOptions);
      }
      return data;
    });

    const result = await Post.insertMany(preparedItems);
    await logAudit(req, "bulk_import", "post", "", `Imported ${result.length} posts`);
    res.status(201).json({ message: `Imported ${result.length} posts`, count: result.length });
  } catch (err) { next(err); }
});

export default router;
