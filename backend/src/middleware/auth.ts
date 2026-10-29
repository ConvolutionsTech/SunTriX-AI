import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { createError } from "./errorHandler";
import { getSetting } from "../lib/configLoader";

export interface AuthRequest extends Request {
  user?: { id: string; email: string; role: string; name: string };
}

const ROLES = ["admin", "viewer"];
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
// Writes a viewer may still perform (they only affect the viewer's own session)
const VIEWER_WRITE_ALLOWLIST = new Set(["POST /v1/auth/logout"]);

/**
 * Verifies the admin JWT. Role policy lives here so it applies to every
 * protected route, including new ones: `viewer` is read-only — any write
 * method requires `admin` — and tokens with an unknown role are rejected.
 */
export function requireAuth(req: AuthRequest, _res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next(createError("Authorization token required", 401));
    }

    const token = authHeader.split(" ")[1];
    const secret = getSetting("JWT_SECRET");
    if (!secret) throw new Error("JWT_SECRET not configured. Set it in Admin → Settings → Security.");

    const decoded = jwt.verify(token, secret) as { id: string; email: string; role: string; name: string };
    if (!ROLES.includes(decoded.role)) {
      return next(createError("Invalid or expired token", 401));
    }
    req.user = decoded;

    const route = `${req.method} ${req.baseUrl}${req.path}`.replace(/\/$/, "");
    if (decoded.role !== "admin" && !SAFE_METHODS.has(req.method) && !VIEWER_WRITE_ALLOWLIST.has(route)) {
      return next(createError("Insufficient permissions", 403));
    }
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return next(createError("Token expired, please log in again", 401));
    }
    return next(createError("Invalid or expired token", 401));
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
