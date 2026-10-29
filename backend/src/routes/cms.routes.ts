import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import CmsContent from "../models/CmsContent";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { createError } from "../middleware/errorHandler";

const router = Router();

/**
 * Site content blocks edited in Admin → Content. Public GETs never write: a
 * block that hasn't been saved yet is served from its defaults in memory.
 * PUTs are admin-only and validated, so links can only be relative paths,
 * anchors, http(s), mailto: or tel: (no javascript: or data: URLs).
 */
const link = z
  .string()
  .trim()
  .max(2048)
  .refine(
    (v) => v === "" || v === "#" || v.startsWith("#") || (v.startsWith("/") && !v.startsWith("//")) || /^(https?:\/\/|mailto:|tel:)/i.test(v),
    "Links must be a site path (/…), an anchor (#…), or start with https://, mailto: or tel:"
  );
const httpUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((v) => v === "" || /^https?:\/\//i.test(v), "Must be an https:// URL");
const text = (max = 500) => z.string().max(max);
const cta = z.object({ text: text(80), link }).passthrough();

const SCHEMAS = {
  hero: z
    .object({
      badge: text(200).optional(),
      headline: z.array(text(200)).max(10).optional(),
      gradientWords: z.array(text(100)).max(10).optional(),
      subheadline: text(1000).optional(),
      ctaPrimary: cta.optional(),
      ctaSecondary: cta.optional(),
      trustPills: z.array(text(100)).max(10).optional(),
      backgroundImage: httpUrl.optional(),
      enabled: z.boolean().optional(),
    })
    .passthrough(),
  announcement: z
    .object({ text: text(300).optional(), link: link.optional(), linkText: text(80).optional(), enabled: z.boolean().optional(), bgColor: text(40).optional() })
    .passthrough(),
  company: z
    .object({
      name: text(120).optional(),
      tagline: text(300).optional(),
      description: text(2000).optional(),
      email: z.union([z.literal(""), z.string().trim().email().max(254)]).optional(),
      phone: text(50).optional(),
      address: text(300).optional(),
      socialLinks: z.array(z.object({ platform: text(50), url: link }).passthrough()).max(30).optional(),
      logo: httpUrl.optional(),
      introVideoUrl: httpUrl.optional(),
      introVideoEnabled: z.boolean().optional(),
    })
    .passthrough(),
  "social-links": z.object({ links: z.array(z.object({ platform: text(50), url: link, enabled: z.boolean().optional() }).passthrough()).max(30) }).passthrough(),
  "intro-video": z.object({ url: httpUrl.optional(), enabled: z.boolean().optional() }).passthrough(),
  seo: z
    .object({ title: text(120).optional(), description: text(320).optional(), keywords: text(500).optional(), ogImage: httpUrl.optional() })
    .passthrough(),
} as const;

const DEFAULTS: Record<string, unknown> = {
  hero: {
    badge: "Accepting new AI & SaaS project briefs",
    headline: ["Engineering", "Intelligence That", "Perceives, Reasons,", "and Acts"],
    gradientWords: ["Intelligence", "Acts"],
    subheadline: "From agentic AI workflows to production-grade SaaS platforms — SunTriX delivers end-to-end AI engineering with a 24-hour proposal guarantee.",
    ctaPrimary: { text: "Request a Demo", link: "/request-task" },
    ctaSecondary: { text: "Watch Overview", link: "#" },
    trustPills: ["50+ Projects Delivered", "Fortune 500 Clients", "24hr Response SLA"],
    backgroundImage: "",
    enabled: true,
  },
  announcement: {
    text: "🚀 Now accepting AI project briefs — 24hr proposal guarantee",
    link: "/request-task",
    linkText: "Submit Brief →",
    enabled: true,
    bgColor: "primary",
  },
  company: {
    name: "SunTriX",
    tagline: "Engineering Intelligence That Perceives, Reasons, and Acts",
    description: "Your AI-first technology partner delivering end-to-end AI engineering.",
    email: "hello@suntrix.com",
    phone: "+1 (555) 123-4567",
    address: "San Francisco, CA",
    socialLinks: [],
    logo: "",
    introVideoUrl: "",
    introVideoEnabled: false,
  },
  "social-links": {
    links: [
      { platform: "LinkedIn", url: "#", enabled: true },
      { platform: "Twitter", url: "#", enabled: true },
      { platform: "GitHub", url: "#", enabled: true },
      { platform: "Upwork", url: "#", enabled: true },
      { platform: "Fiverr", url: "#", enabled: true },
      { platform: "YouTube", url: "#", enabled: false },
      { platform: "Instagram", url: "#", enabled: false },
    ],
  },
  "intro-video": { url: "", enabled: false },
};

const SEO_DEFAULT = {
  title: "SunTriX — AI Engineering Agency",
  description: "Engineering Intelligence That Perceives, Reasons, and Acts.",
  keywords: "AI, machine learning, agentic AI, computer vision, SaaS",
  ogImage: "",
};

/** Pages that can carry SEO overrides (the public routes in src/App.tsx). */
export const SEO_PAGES = new Set([
  "home", "services", "how-we-work", "work", "about", "contact", "request-task", "track", "technologies",
  "partnership", "testimonials", "blog", "pricing", "privacy", "terms", "cookies",
]);

async function read(key: string, fallback: unknown): Promise<unknown> {
  const doc = await CmsContent.findOne({ key }).lean();
  return doc?.data ?? fallback;
}

async function save(key: string, data: unknown): Promise<unknown> {
  const doc = await CmsContent.findOneAndUpdate({ key }, { data }, { new: true, upsert: true, runValidators: true }).lean();
  return doc!.data;
}

function parse<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw createError(`${issue.path.join(".") || "body"}: ${issue.message}`, 400);
  }
  return result.data;
}

type BlockKey = "hero" | "announcement" | "company" | "social-links" | "intro-video";

const getBlock = (key: BlockKey) => async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await read(key, DEFAULTS[key]));
  } catch (err) {
    next(err);
  }
};

const putBlock = (key: BlockKey) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await save(key, parse(SCHEMAS[key], req.body)));
  } catch (err) {
    next(err);
  }
};

router.get("/hero", getBlock("hero"));
router.put("/hero", requireAuth, requireAdmin, putBlock("hero"));
router.get("/announcement", getBlock("announcement"));
router.put("/announcement", requireAuth, requireAdmin, putBlock("announcement"));
router.get("/company", getBlock("company"));
router.put("/company", requireAuth, requireAdmin, putBlock("company"));
router.get("/social-links", getBlock("social-links"));
router.put("/social-links", requireAuth, requireAdmin, putBlock("social-links"));
router.get("/intro-video", getBlock("intro-video"));
router.put("/intro-video", requireAuth, requireAdmin, putBlock("intro-video"));

function seoPage(req: Request): string {
  const page = req.params.page;
  if (!SEO_PAGES.has(page)) throw createError("Unknown page", 404);
  return page;
}

// GET /cms/seo/:page — defaults for a known page; never creates documents
router.get("/seo/:page", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = seoPage(req);
    res.json(await read(`seo_${page}`, { page, ...SEO_DEFAULT }));
  } catch (err) {
    next(err);
  }
});

// PUT /cms/seo/:page — admin
router.put("/seo/:page", requireAuth, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = seoPage(req);
    res.json(await save(`seo_${page}`, { ...parse(SCHEMAS.seo, req.body), page }));
  } catch (err) {
    next(err);
  }
});

// GET /cms/content — every saved block (admin)
router.get("/content", requireAuth, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await CmsContent.find().sort({ key: 1 }).limit(200));
  } catch (err) {
    next(err);
  }
});

export default router;
