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
const ADMIN_ONLY_READS = new Set(["get /v1/settings", "get /v1/admin/users"]);
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
