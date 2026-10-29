import { timingSafeEqual } from "crypto";
import { Request, Response, NextFunction, RequestHandler } from "express";
import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";

/**
 * Prometheus metrics, served at GET /metrics when METRICS_TOKEN is set.
 * Route labels use the Express route pattern (never the raw URL), so tokens
 * and ids don't leak into labels or blow up cardinality.
 */
export const registry = new Registry();
if (process.env.NODE_ENV !== "test") collectDefaultMetrics({ register: registry });

export const httpRequests = new Counter({
  name: "http_requests_total",
  help: "HTTP requests by route pattern, method and status",
  labelNames: ["route", "method", "status"] as const,
  registers: [registry],
});

export const httpDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request latency by route pattern",
  labelNames: ["route", "method"] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

export const stripeWebhookEvents = new Counter({
  name: "stripe_webhook_events_total",
  help: "Stripe webhook deliveries by event type and result (ok, duplicate, invalid, retry)",
  labelNames: ["type", "result"] as const,
  registers: [registry],
});

export const groqRequests = new Counter({
  name: "groq_requests_total",
  help: "Groq LLM calls by operation and result",
  labelNames: ["operation", "result"] as const,
  registers: [registry],
});

export const emailSends = new Counter({
  name: "email_send_total",
  help: "Resend API calls by kind (single, batch) and result",
  labelNames: ["kind", "result"] as const,
  registers: [registry],
});

const ROUTE_LABEL = Symbol("routeLabel");
type Labelled = Request & { [ROUTE_LABEL]?: string };

/**
 * Express restores req.baseUrl when a handler calls next(err), so by "finish"
 * the mount path is gone. Record the full pattern the moment a route matches.
 */
function trackRoute(req: Labelled): void {
  let route: Request["route"];
  Object.defineProperty(req, "route", {
    configurable: true,
    enumerable: true,
    get: () => route,
    set: (value) => {
      route = value;
      if (value?.path) req[ROUTE_LABEL] = `${req.baseUrl}${value.path}`;
    },
  });
}

export function metricsMiddleware(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.path === "/metrics") return next();
    trackRoute(req);
    const stop = httpDuration.startTimer();
    res.on("finish", () => {
      const route = (req as Labelled)[ROUTE_LABEL] ?? "unmatched";
      httpRequests.inc({ route, method: req.method, status: String(res.statusCode) });
      stop({ route, method: req.method });
    });
    next();
  };
}

/** GET /metrics — 404 unless METRICS_TOKEN is configured; then requires it as a Bearer token. */
export function metricsHandler(): RequestHandler {
  return async (req: Request, res: Response) => {
    const expected = process.env.METRICS_TOKEN;
    if (!expected) {
      res.status(404).json({ error: "Route not found" });
      return;
    }
    const given = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      res.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED" });
      return;
    }
    res.setHeader("Content-Type", registry.contentType);
    res.send(await registry.metrics());
  };
}
