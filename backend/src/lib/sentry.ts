import * as Sentry from "@sentry/node";
import { redactUrl } from "./logger";

/**
 * Error tracking, only when SENTRY_DSN is set. Events never carry request
 * bodies, headers, cookies, client emails or capability tokens.
 */
export function sentryEnabled(): boolean {
  return Boolean(process.env.SENTRY_DSN) && process.env.NODE_ENV !== "test";
}

export function scrubEvent<T extends Sentry.ErrorEvent>(event: T): T {
  if (event.request) {
    if (event.request.url) event.request.url = redactUrl(event.request.url.replace(/^https?:\/\/[^/]+/, ""));
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.query_string;
  }
  if (event.user) event.user = event.user.id ? { id: event.user.id } : undefined;
  return event;
}

export function initSentry(): void {
  if (!sentryEnabled()) return;
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    release: process.env.GIT_SHA,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend: (event) => scrubEvent(event),
  });
}

/** Report an unexpected (5xx) error, tagged with the request id so it matches the logs. */
export function captureServerError(err: unknown, ctx: { requestId?: string; method?: string; url?: string; status: number }): void {
  if (!sentryEnabled()) return;
  Sentry.withScope((scope) => {
    if (ctx.requestId) scope.setTag("requestId", ctx.requestId);
    scope.setTag("status", String(ctx.status));
    if (ctx.method && ctx.url) scope.setContext("request", { method: ctx.method, url: redactUrl(ctx.url) });
    Sentry.captureException(err);
  });
}

/** Give queued events up to 2 s to reach Sentry before the process exits. */
export async function flushSentry(): Promise<void> {
  if (sentryEnabled()) await Sentry.flush(2000).catch(() => undefined);
}
