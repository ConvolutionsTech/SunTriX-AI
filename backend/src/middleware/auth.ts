import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { createError } from "./errorHandler";
import { getSetting } from "../lib/configLoader";
import { currentTokenState, AccessClaims } from "../lib/tokens";

export interface AuthRequest extends Request {
  user?: { id: string; email: string; role: string; name: string };
}

const ROLES = ["admin", "viewer"];
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
// Writes a viewer may still perform (they only affect the viewer's own session)
const VIEWER_WRITE_ALLOWLIST = new Set(["POST /v1/auth/logout", "POST /v1/auth/password"]);

/**
 * Verifies the admin JWT and that it has not been revoked: its `tv` must match
 * the admin's current tokenVersion (cached ≤ 60 s), and the role is taken from
 * the database, so deleted or demoted admins lose access promptly.
 * Role policy lives here so it applies to every protected route, including new
 * ones: `viewer` is read-only — any write requires `admin` — and unknown roles
 * are rejected.
 */
export async function requireAuth(req: AuthRequest, _res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next(createError("Authorization token required", 401));
    }

    const token = authHeader.split(" ")[1];
    const secret = getSetting("JWT_SECRET");
    if (!secret) throw new Error("JWT_SECRET not configured");

    let decoded: AccessClaims;
    try {
      decoded = jwt.verify(token, secret) as AccessClaims;
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) return next(createError("Token expired, please log in again", 401));
      return next(createError("Invalid or expired token", 401));
    }

    const state = typeof decoded.tv === "number" ? await currentTokenState(decoded.id) : null;
    if (!state || state.tv !== decoded.tv || !ROLES.includes(state.role)) {
      return next(createError("Invalid or expired token", 401));
    }
    req.user = { id: decoded.id, email: decoded.email, name: decoded.name, role: state.role };

    const route = `${req.method} ${req.baseUrl}${req.path}`.replace(/\/$/, "");
    if (state.role !== "admin" && !SAFE_METHODS.has(req.method) && !VIEWER_WRITE_ALLOWLIST.has(route)) {
      return next(createError("Insufficient permissions", 403));
    }
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(createError("Insufficient permissions", 403));
    }
    next();
  };
}

export const requireAdmin = requireRole("admin");

/**
 * Identifies staff on public routes without requiring login: a valid token
 * sets req.user, anything else (missing, malformed, expired) is treated as
 * anonymous. Use it where staff see more than the public (drafts, hidden items).
 */
export function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const secret = getSetting("JWT_SECRET");
  if (authHeader?.startsWith("Bearer ") && secret) {
    try {
      const decoded = jwt.verify(authHeader.split(" ")[1], secret) as { id: string; email: string; role: string; name: string };
      if (ROLES.includes(decoded.role)) req.user = decoded;
    } catch {
      // Invalid token → anonymous
    }
  }
  next();
}
