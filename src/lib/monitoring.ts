import * as Sentry from "@sentry/react";

// Client pages carry their capability token in the path; never send it to Sentry.
const TOKEN_ROUTES = /\/(proposal|contract|invoice|track|admin\/reset-password)\/[^/?#]+/g;

export function scrubUrl(url: string): string {
  return url.replace(TOKEN_ROUTES, "/$1/:token").replace(/([?&](?:token|t)=)[^&#]*/gi, "$1[redacted]");
}

/** Error tracking, only when VITE_SENTRY_DSN is set at build time. */
export function initMonitoring(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend(event) {
      if (event.request?.url) event.request.url = scrubUrl(event.request.url);
      delete event.request?.headers;
      delete event.request?.cookies;
      if (event.user) event.user = event.user.id ? { id: event.user.id } : undefined;
      return event;
    },
    beforeBreadcrumb(crumb) {
      for (const key of ["url", "from", "to"] as const) {
        const value = crumb.data?.[key];
        if (typeof value === "string") crumb.data![key] = scrubUrl(value);
      }
      return crumb;
    },
  });
}
