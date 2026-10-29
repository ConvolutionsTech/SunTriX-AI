import "dotenv/config";
import { loadSettingsFromDB, getSetting } from "./lib/configLoader";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { logger, httpLogger } from "./lib/logger";
import rateLimit from "express-rate-limit";
import mongoSanitize from "express-mongo-sanitize";
import { connectDB } from "./config/db";
import { validateEnv } from "./config/env";
import { parseTrustProxy } from "./lib/trustProxy";
import { errorHandler } from "./middleware/errorHandler";
import { AppError } from "./shared/errors/appError";

// Route imports
import authRoutes from "./routes/auth.routes";
import portfolioRoutes from "./routes/portfolio.routes";
import caseStudyRoutes from "./routes/caseStudy.routes";
import testimonialRoutes from "./routes/testimonial.routes";
import taskRequestRoutes from "./routes/taskRequest.routes";
import contactRoutes from "./routes/contact.routes";
import newsletterRoutes from "./routes/newsletter.routes";
import chatRoutes from "./routes/chat.routes";
import cmsRoutes from "./routes/cms.routes";
import departmentRoutes from "./routes/department.routes";
import uploadRoutes from "./routes/upload.routes";
import adminRoutes from "./routes/admin.routes";
import adminUserRoutes from "./routes/adminUsers.routes";
import teamRoutes from "./routes/team.routes";
import clientRoutes from "./routes/client.routes";
import pricingRoutes from "./routes/pricing.routes";
import postRoutes from "./routes/post.routes";
import auditRoutes from "./routes/audit.routes";
import aiExtractRoutes from "./routes/aiExtract.routes";
import paymentRoutes from "./routes/payment.routes";
import settingsRoutes from "./routes/settings.routes";
import proposalRoutes from "./routes/proposal.routes";
import contractRoutes from "./routes/contract.routes";
import { startScheduler } from "./lib/scheduler";

const app = express();
const PORT = process.env.PORT || 4000;

// ─── Trust Proxy ──────────────────────────────────────────────────
// See lib/trustProxy.ts — unset TRUST_PROXY trusts no proxy, so clients can't spoof req.ip
app.set("trust proxy", parseTrustProxy(process.env.TRUST_PROXY));

// ─── Request logging (first, so every response — even a CORS or rate-limit rejection — has a request id) ──
app.use(httpLogger());

// ─── Security ────────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

// ─── CORS ────────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL || "http://localhost:5173",
  "http://localhost:5173",
  "http://localhost:3000",
];

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new AppError(`CORS: origin ${origin} not allowed`, 403, "CORS"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// ─── Rate Limiting ───────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: (_req, _res) => parseInt(getSetting("RATE_LIMIT_MAX", "500")),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 5, // 5 login attempts per 15 min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again in 15 minutes." },
  // Express routing is case-insensitive and ignores a trailing slash, so normalise
  // the same way — otherwise /login/ or /LOGIN would bypass the limit
  skip: (req) => {
    if (req.method !== "POST") return true;
    const path = req.path.toLowerCase().replace(/\/+$/, "");
    return !(path === "/login" || path === "/forgot" || path.startsWith("/reset/"));
  },
});

const formLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: (_req, _res) => parseInt(getSetting("RATE_LIMIT_CONTACT", "5")),
  message: { error: "Too many submissions. Please try again in an hour." },
  // Public form submissions only (POST / on each router) — admin actions on the
  // same routers (replies, campaigns) must not share the 5-per-hour budget
  skip: (req) => req.method !== "POST" || req.path !== "/",
});

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: (_req, _res) => parseInt(getSetting("RATE_LIMIT_CHAT", "10")),
  message: { error: "Chat rate limit exceeded. Please wait a moment." },
});

app.use(globalLimiter);

// ─── Maintenance Mode ────────────────────────────────────────────
const MAINTENANCE_BYPASS_PREFIXES = [
  "/health",
  "/v1/auth",
  "/v1/admin",
  "/v1/settings",
  "/v1/tracker/client",
  "/v1/proposals",
  "/v1/contracts",
  "/v1/payments/invoice",
  "/v1/payments/verify",
  "/v1/payments/webhook",
  "/v1/newsletter/confirm",
];
app.use((req, res, next) => {
  if (getSetting("MAINTENANCE_MODE", "false") !== "true") return next();
  const isAdminRoute = MAINTENANCE_BYPASS_PREFIXES.some((p) => req.path.startsWith(p));
  if (isAdminRoute) return next();
  if (req.headers.authorization?.startsWith("Bearer ")) {
    try {
      const token = req.headers.authorization.split(" ")[1];
      const jwt = require("jsonwebtoken");
      jwt.verify(token, getSetting("JWT_SECRET"));
      return next();
    } catch {
      // Invalid token — block request during maintenance
    }
  }
  res.status(503).json({
    error: "Service Temporarily Unavailable",
    message: "The platform is undergoing scheduled maintenance. Please check back shortly.",
    maintenanceMode: true,
  });
});

// ─── Stripe Webhook Raw Body (MUST be before express.json) ──────
// Only the webhook path gets raw Buffer — everything else gets JSON
app.use((req, res, next) => {
  // req.path ignores any query string Stripe may be configured with
  if (req.path === "/v1/payments/webhook") {
    express.raw({ type: "application/json" })(req, res, next);
  } else {
    next();
  }
});

// ─── Body Parsing ────────────────────────────────────────────────
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ─── NoSQL Injection Protection ──────────────────────────────────
// Strips keys containing $ or . from req.body, req.params, req.query
app.use(mongoSanitize({ replaceWith: "_" }));

// ─── Health Check ─────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString(), env: process.env.NODE_ENV });
});

// ─── API Routes ──────────────────────────────────────────────────
const V1 = "/v1";

// (webhook raw body is handled above before express.json)

import trackerRoutes from "./routes/tracker.routes";

app.use(`${V1}/auth`, authLimiter, authRoutes);
app.use(`${V1}/portfolio`, portfolioRoutes);
app.use(`${V1}/case-studies`, caseStudyRoutes);
app.use(`${V1}/testimonials`, testimonialRoutes);
app.use(`${V1}/task-requests`, formLimiter, taskRequestRoutes);
app.use(`${V1}/contact`, formLimiter, contactRoutes);
app.use(`${V1}/newsletter`, formLimiter, newsletterRoutes);
app.use(`${V1}/chat`, chatLimiter, chatRoutes);
app.use(`${V1}/cms`, cmsRoutes);
app.use(`${V1}/departments`, departmentRoutes);
app.use(`${V1}/upload`, uploadRoutes);
app.use(`${V1}/admin/users`, adminUserRoutes);
app.use(`${V1}/admin`, adminRoutes);
app.use(`${V1}/team`, teamRoutes);
app.use(`${V1}/clients`, clientRoutes);
app.use(`${V1}/pricing`, pricingRoutes);
app.use(`${V1}/posts`, postRoutes);
app.use(`${V1}/audit`, auditRoutes);
app.use(`${V1}/ai`, aiExtractRoutes);
app.use(`${V1}/payments`, paymentRoutes);
app.use(`${V1}/settings`, settingsRoutes);
app.use(`${V1}/proposals`, proposalRoutes);
app.use(`${V1}/contracts`, contractRoutes);
app.use(`${V1}/tracker`, trackerRoutes);

// ─── 404 ──────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// ─── Error Handler ────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────────
async function start() {
  validateEnv();
  await connectDB();
  // Load all settings into process.env before any route runs
  await loadSettingsFromDB();
  startScheduler();
  app.listen(PORT, () => {
    logger.info({ port: PORT, env: process.env.NODE_ENV }, `SunTriX API listening on :${PORT}`);
  });
}

if (process.env.NODE_ENV !== "test") {
  start().catch((err) => {
    logger.fatal({ err }, "Fatal startup error");
    process.exit(1);
  });
}

export default app;
