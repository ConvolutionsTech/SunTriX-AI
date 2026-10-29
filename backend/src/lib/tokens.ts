/**
 * Admin session tokens.
 *
 * - Access token (JWT_SECRET, JWT_EXPIRY, default 15m): { id, email, role, name, tv }.
 *   `tv` must match Admin.tokenVersion — bumping it revokes every token at once.
 * - Refresh token (JWT_REFRESH_SECRET, 7d): { id, jti, tv }. Each jti is stored on
 *   the admin and rotated on use. Presenting a jti that was rotated more than
 *   REUSE_GRACE_MS ago (or never issued) is treated as theft: all sessions end.
 *   The grace window lets two tabs that refresh at the same moment both succeed.
 */
import crypto from "crypto";
import jwt from "jsonwebtoken";
import Admin, { IAdmin } from "../models/Admin";
import { getSetting } from "./configLoader";
import { AppError, ERROR_CODES } from "../shared/errors/appError";

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const REUSE_GRACE_MS = 30 * 1000;
const MAX_SESSIONS = 10;

type Expiry = `${number}${"s" | "m" | "h" | "d" | "w"}`;

export interface AccessClaims {
  id: string;
  email: string;
  role: string;
  name: string;
  tv: number;
}

function secrets() {
  const access = getSetting("JWT_SECRET");
  const refresh = getSetting("JWT_REFRESH_SECRET");
  if (!access || !refresh) throw new AppError("Authentication is not configured", ERROR_CODES.INTERNAL_SERVER_ERROR);
  return { access, refresh };
}

export function signAccessToken(admin: Pick<IAdmin, "_id" | "email" | "role" | "name" | "tokenVersion">): string {
  const claims: AccessClaims = {
    id: String(admin._id),
    email: admin.email,
    role: admin.role,
    name: admin.name,
    tv: admin.tokenVersion ?? 0,
  };
  return jwt.sign(claims, secrets().access, { expiresIn: getSetting("JWT_EXPIRY", "15m") as Expiry });
}

/** Issues a new token pair and records the refresh session. */
export async function issueSession(admin: IAdmin): Promise<{ token: string; refreshToken: string }> {
  const jti = crypto.randomBytes(24).toString("base64url");
  const now = Date.now();

  // Atomic push (concurrent logins/refreshes must not overwrite each other), then
  // prune expired sessions and rotated ones past the grace window
  await Admin.updateOne(
    { _id: admin._id },
    { $push: { refreshTokens: { $each: [{ jti, expiresAt: new Date(now + REFRESH_TTL_MS) }], $slice: -MAX_SESSIONS * 2 } } }
  );
  await Admin.updateOne(
    { _id: admin._id },
    { $pull: { refreshTokens: { $or: [{ expiresAt: { $lt: new Date(now) } }, { rotatedAt: { $lt: new Date(now - REUSE_GRACE_MS) } }] } } }
  );

  const refreshToken = jwt.sign({ id: String(admin._id), jti, tv: admin.tokenVersion ?? 0 }, secrets().refresh, {
    expiresIn: Math.floor(REFRESH_TTL_MS / 1000),
  });
  return { token: signAccessToken(admin), refreshToken };
}

const unauthorized = () => new AppError("Invalid or expired refresh token", ERROR_CODES.UNAUTHORIZED);

/** Exchanges a refresh token for a new pair (rotation with reuse detection). */
export async function rotateSession(refreshToken: string): Promise<{ token: string; refreshToken: string }> {
  let claims: { id: string; jti: string; tv: number };
  try {
    claims = jwt.verify(refreshToken, secrets().refresh) as typeof claims;
  } catch {
    throw unauthorized();
  }
  if (!claims.jti) throw unauthorized();

  // Atomically mark this jti as used, so two concurrent exchanges can't both pass as "first"
  const admin = await Admin.findOneAndUpdate(
    { _id: claims.id, tokenVersion: claims.tv, refreshTokens: { $elemMatch: { jti: claims.jti, rotatedAt: { $exists: false } } } },
    { $set: { "refreshTokens.$.rotatedAt": new Date() } },
    { new: true }
  );
  if (admin) return issueSession(admin);

  // Not a fresh token: a recent concurrent rotation is benign, anything else is reuse
  const current = await Admin.findById(claims.id);
  if (!current || current.tokenVersion !== claims.tv) throw unauthorized();
  const entry = current.refreshTokens.find((t) => t.jti === claims.jti);
  if (entry?.rotatedAt && Date.now() - entry.rotatedAt.getTime() < REUSE_GRACE_MS) {
    return issueSession(current);
  }
  await revokeAllSessions(claims.id);
  throw unauthorized();
}

/** Ends every session for the admin: access tokens (via tokenVersion) and refresh tokens. */
export async function revokeAllSessions(adminId: string): Promise<void> {
  await Admin.updateOne({ _id: adminId }, { $inc: { tokenVersion: 1 }, $set: { refreshTokens: [] } });
  forgetTokenVersion(adminId);
}

// ─── tokenVersion cache for requireAuth (per process, short TTL) ──────────
const VERSION_TTL_MS = 60 * 1000;
const versionCache = new Map<string, { tv: number; role: string; at: number }>();

export async function currentTokenState(adminId: string): Promise<{ tv: number; role: string } | null> {
  const cached = versionCache.get(adminId);
  if (cached && Date.now() - cached.at < VERSION_TTL_MS) return cached;
  const admin = await Admin.findById(adminId).select("tokenVersion role").lean();
  if (!admin) {
    versionCache.delete(adminId);
    return null;
  }
  const state = { tv: admin.tokenVersion ?? 0, role: admin.role, at: Date.now() };
  versionCache.set(adminId, state);
  return state;
}

export function forgetTokenVersion(adminId: string): void {
  versionCache.delete(adminId);
}
