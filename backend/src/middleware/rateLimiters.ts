import rateLimit from "express-rate-limit";
import { getSetting } from "../lib/configLoader";

/**
 * Rate limits. Counters live in process memory, so with several instances each
 * one enforces the limit separately (effective limit = limit × instances).
 * Maxima come from Admin → Settings → Security and apply without a restart.
 */
const setting = (key: string, fallback: number) => () => parseInt(getSetting(key, String(fallback))) || fallback;

const UNTHROTTLED = new Set(["/health", "/ready", "/metrics", "/v1/payments/webhook"]);

/** Every request per IP. Probes and the signature-checked Stripe webhook are exempt. */
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: setting("RATE_LIMIT_MAX", 500),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later.", code: "RATE_LIMITED" },
  skip: (req) => UNTHROTTLED.has(req.path),
});

/** Login, forgot-password and reset attempts per IP. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: setting("RATE_LIMIT_AUTH_MAX", 5),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again in 15 minutes.", code: "RATE_LIMITED" },
  // Express routing is case-insensitive and ignores a trailing slash, so normalise
  // the same way — otherwise /login/ or /LOGIN would bypass the limit
  skip: (req) => {
    if (req.method !== "POST") return true;
    const path = req.path.toLowerCase().replace(/\/+$/, "");
    return !(path === "/login" || path === "/forgot" || path.startsWith("/reset/"));
  },
});

/**
 * Public form submissions per IP. A factory: each form gets its own budget, and
 * it's mounted on the public POST handler only, so admin actions on the same
 * routers (replies, campaigns) are never throttled by it.
 */
export function formLimiter() {
  return rateLimit({
    windowMs: 60 * 60 * 1000,
    max: setting("RATE_LIMIT_CONTACT", 5),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many submissions. Please try again in an hour.", code: "RATE_LIMITED" },
  });
}

/** Website chat messages per IP. */
export const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: setting("RATE_LIMIT_CHAT", 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Chat rate limit exceeded. Please wait a moment.", code: "RATE_LIMITED" },
});
