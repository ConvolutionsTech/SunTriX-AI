import { Router, Request, Response, NextFunction } from "express";
import Post from "../models/Post";
import Portfolio from "../models/Portfolio";
import { getSetting } from "../lib/configLoader";

const router = Router();

/** Public marketing routes (src/App.tsx). Client token pages and the admin are never listed. */
const STATIC_PATHS = [
  "/", "/services", "/how-we-work", "/work", "/about", "/contact", "/request-task", "/technologies",
  "/partnership", "/testimonials", "/blog", "/pricing", "/legal/privacy", "/legal/terms", "/legal/cookies",
];

const xmlEscape = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

// GET /v1/sitemap.xml — static pages plus published blog posts and portfolio items
router.get("/sitemap.xml", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const base = getSetting("FRONTEND_URL", "http://localhost:5173").replace(/\/+$/, "");
    const [posts, projects] = await Promise.all([
      Post.find({ status: "published" }).select("slug updatedAt").sort({ publishedAt: -1 }).limit(5000).lean(),
      Portfolio.find({ status: "published" }).select("slug updatedAt").limit(5000).lean(),
    ]);
    const url = (path: string, lastmod?: Date) =>
      `  <url><loc>${xmlEscape(base + path)}</loc>${lastmod ? `<lastmod>${new Date(lastmod).toISOString().slice(0, 10)}</lastmod>` : ""}</url>`;
    const body = [
      ...STATIC_PATHS.map((p) => url(p)),
      ...posts.map((p) => url(`/blog/${encodeURIComponent(p.slug)}`, (p as { updatedAt?: Date }).updatedAt)),
      ...projects.map((p) => url(`/work/${encodeURIComponent(p.slug)}`, p.updatedAt)),
    ].join("\n");
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`);
  } catch (err) {
    next(err);
  }
});

export default router;
