import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../app";
import { requireAuth } from "../middleware/auth";
import { connectTestDb, disconnectTestDb } from "./helpers/db";
import { staffToken } from "./helpers/auth";
import jwt from "jsonwebtoken";

/**
 * Route-matrix policy test. Walks the real Express route stack, so a newly
 * added route is covered automatically: every route guarded by requireAuth
 * must reject anonymous callers, and viewers must be read-only.
 */
type Method = "get" | "post" | "put" | "patch" | "delete";
interface RouteInfo { method: Method; path: string }

const SAMPLE_ID = "507f1f77bcf86cd799439011";
const ADMIN_ONLY_READS = new Set(["get /v1/settings", "get /v1/settings/status", "get /v1/admin/users"]);
const VIEWER_WRITE_ALLOWED = new Set(["post /v1/auth/logout", "post /v1/auth/password"]);

function mountPath(layer: any): string {
  // Express 4 stores the mount path only inside the layer's regexp, e.g. ^\/v1\/auth\/?(?=\/|$)
  return layer.regexp.source.replace("^", "").replace("\\/?(?=\\/|$)", "").replace(/\\\//g, "/");
}

function protectedRoutes(): RouteInfo[] {
  const routes: RouteInfo[] = [];
  for (const layer of (app as any)._router.stack) {
    if (layer.name !== "router") continue;
    const prefix = mountPath(layer);
    for (const sub of layer.handle.stack) {
      if (!sub.route) continue;
      const guarded = sub.route.stack.some((s: any) => s.handle === requireAuth);
      if (!guarded) continue;
      for (const method of Object.keys(sub.route.methods) as Method[]) {
        routes.push({ method, path: (prefix + sub.route.path.replace(/:[A-Za-z]+/g, SAMPLE_ID)).replace(/\/$/, "") });
      }
    }
  }
  return routes;
}

const tokens: Record<string, string> = {};
const token = (role: string) => tokens[role];

/**
 * Every route reachable without logging in. Adding an unauthenticated route
 * fails this suite until it is reviewed and listed here.
 */
const PUBLIC_ROUTES = new Set([
  // Admin sign-in and password reset (rate-limited)
  "POST /v1/auth/login", "POST /v1/auth/refresh", "POST /v1/auth/forgot", "POST /v1/auth/reset/:token",
  // Published site content (drafts need a staff token — publicDrafts.test.ts)
  "GET /v1/portfolio", "GET /v1/portfolio/slug/:slug", "GET /v1/portfolio/:id",
  "GET /v1/case-studies", "GET /v1/case-studies/slug/:slug", "GET /v1/case-studies/:id",
  "GET /v1/testimonials", "GET /v1/departments", "GET /v1/departments/:id", "GET /v1/team", "GET /v1/clients",
  "GET /v1/pricing", "GET /v1/posts", "GET /v1/posts/slug/:slug", "GET /v1/settings/public",
  "GET /v1/cms/hero", "GET /v1/cms/announcement", "GET /v1/cms/company", "GET /v1/cms/seo/:page",
  "GET /v1/cms/social-links", "GET /v1/cms/intro-video",
  // Public forms and chatbot (rate-limited)
  "POST /v1/task-requests", "POST /v1/contact", "POST /v1/newsletter", "POST /v1/chat",
  // Capability links sent to clients by email
  "GET /v1/task-requests/track/:token",
  "GET /v1/newsletter/confirm/:token", "GET /v1/newsletter/unsubscribe/:token", "POST /v1/newsletter/unsubscribe/:token",
  "GET /v1/proposals/view/:token", "POST /v1/proposals/accept/:token", "POST /v1/proposals/request-changes/:token",
  "GET /v1/contracts/:token", "POST /v1/contracts/:token/sign",
  "GET /v1/payments/invoice/:token", "POST /v1/payments/invoice/:token/checkout",
  "GET /v1/tracker/client/:token", "POST /v1/tracker/client/:token/chat", "POST /v1/tracker/client/:token/completion/approve",
  "POST /v1/tracker/client/:token/deliverable/:dId/approve", "POST /v1/tracker/client/:token/deliverable/:dId/reject",
  "POST /v1/tracker/client/:token/update/:uId/acknowledge", "POST /v1/tracker/client/:token/file/:fId/approve",
  "POST /v1/tracker/client/:token/file/:fId/reject", "POST /v1/tracker/client/:token/milestone/:mId/checkout",
  // Stripe → us (signature-verified)
  "POST /v1/payments/webhook",
]);

function unguardedRoutes(): string[] {
  const out: string[] = [];
  for (const layer of (app as any)._router.stack) {
    if (layer.name !== "router") continue;
    for (const sub of layer.handle.stack) {
      if (!sub.route || sub.route.stack.some((s: any) => s.handle === requireAuth)) continue;
      for (const m of Object.keys(sub.route.methods)) out.push(`${m.toUpperCase()} ${(mountPath(layer) + sub.route.path).replace(/\/$/, "")}`);
    }
  }
  return out;
}

const routes = protectedRoutes();
const writes = routes.filter((r) => r.method !== "get" && !VIEWER_WRITE_ALLOWED.has(`${r.method} ${r.path}`));
const reads = routes.filter((r) => r.method === "get");

describe("route policy", () => {
  beforeAll(async () => {
    await connectTestDb();
    tokens.admin = await staffToken("admin");
    tokens.viewer = await staffToken("viewer");
  }, 120000);

  afterAll(async () => {
    await disconnectTestDb();
  });

  it("every unauthenticated route is a reviewed public route", () => {
    expect(unguardedRoutes().sort()).toEqual([...PUBLIC_ROUTES].sort());
  });

  it.each(routes)("forged token → 401: $method $path", async ({ method, path }) => {
    const res = await request(app)[method](path).set("Authorization", "Bearer forged.token.value").send({});
    expect(res.status).toBe(401);
  });

  it.each([
    "/v1/proposals/view/nope", "/v1/contracts/nope", "/v1/payments/invoice/nope", "/v1/tracker/client/nope", "/v1/task-requests/track/nope",
  ])("unknown client token → 404: GET %s", async (path) => {
    expect((await request(app).get(path)).status).toBe(404);
  });

  it("discovers the protected routes", () => {
    expect(routes.length).toBeGreaterThan(80);
    expect(writes.length).toBeGreaterThan(50);
  });

  it.each(routes)("anonymous → 401: $method $path", async ({ method, path }) => {
    const res = await request(app)[method](path).send({});
    expect(res.status).toBe(401);
  });

  it.each(writes)("viewer write → 403: $method $path", async ({ method, path }) => {
    const res = await request(app)[method](path).set("Authorization", `Bearer ${token("viewer")}`).send({});
    expect(res.status).toBe(403);
  });

  it.each(reads)("viewer read allowed (except admin-only reads): $method $path", async ({ method, path }) => {
    const res = await request(app)[method](path).set("Authorization", `Bearer ${token("viewer")}`);
    if (ADMIN_ONLY_READS.has(`${method} ${path}`)) expect(res.status).toBe(403);
    else expect([401, 403]).not.toContain(res.status);
  });

  it.each(reads)("admin read allowed: $method $path", async ({ method, path }) => {
    const res = await request(app)[method](path).set("Authorization", `Bearer ${token("admin")}`);
    expect([401, 403]).not.toContain(res.status);
  });

  it("rejects a token with an unknown role", async () => {
    const forged = jwt.sign({ id: SAMPLE_ID, email: "x@suntrix.test", role: "superuser", name: "x", tv: 0 }, process.env.JWT_SECRET!);
    const res = await request(app).get("/v1/audit").set("Authorization", `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });
});
