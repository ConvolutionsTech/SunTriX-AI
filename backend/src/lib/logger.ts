import { randomUUID } from "crypto";
import type { IncomingMessage, ServerResponse } from "http";
import pino, { DestinationStream, Logger } from "pino";
import pinoHttp from "pino-http";

/**
 * One JSON logger for the whole API. Pretty-printed only in development;
 * silent in tests unless LOG_LEVEL is set.
 */
function defaultLevel(): string {
  if (process.env.LOG_LEVEL) return process.env.LOG_LEVEL;
  if (process.env.NODE_ENV === "test") return "silent";
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

export function createLogger(destination?: DestinationStream): Logger {
  const options: pino.LoggerOptions = {
    level: defaultLevel(),
    base: { service: "suntrix-api" },
    redact: { paths: ["req.headers.authorization", "req.headers.cookie", "req.headers[\"stripe-signature\"]"], censor: "[redacted]" },
  };
  if (destination) return pino(options, destination);
  if (process.env.NODE_ENV === "development") {
    return pino({ ...options, transport: { target: "pino-pretty", options: { translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname,service" } } });
  }
  return pino(options);
}

export const logger = createLogger();

// Capability links carry their secret in the path: never write it to a log.
const TOKEN_PATHS =
  /^(\/v1\/(?:proposals\/(?:view|accept|request-changes)|contracts(?!\/admin(?:\/|$))|tracker\/client|payments\/invoice|task-requests\/track|newsletter\/(?:confirm|unsubscribe)|auth\/reset))\/[^/?]+/;

export function redactUrl(url: string): string {
  const [path, query] = url.split("?");
  const safePath = path.replace(TOKEN_PATHS, "$1/:token");
  // Query strings can carry tokens too (e.g. ?token=…); drop their values.
  const safeQuery = query?.replace(/(^|&)(token|t|key|signature)=[^&]*/gi, "$1$2=[redacted]");
  return safeQuery ? `${safePath}?${safeQuery}` : safePath;
}

const QUIET_PATHS = new Set(["/health", "/ready"]);

export function httpLogger(base: Logger = logger) {
  return pinoHttp({
    logger: base,
    genReqId: (req: IncomingMessage, res: ServerResponse) => {
      const incoming = req.headers["x-request-id"];
      const id = typeof incoming === "string" && /^[\w.-]{1,128}$/.test(incoming) ? incoming : randomUUID();
      res.setHeader("X-Request-Id", id);
      return id;
    },
    autoLogging: { ignore: (req) => QUIET_PATHS.has((req.url ?? "").split("?")[0]) },
    customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info"),
    serializers: {
      req: (req) => ({ id: req.id, method: req.method, url: redactUrl(req.url ?? ""), remoteAddress: req.remoteAddress }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
    customSuccessMessage: (req, res) => `${req.method} ${redactUrl(req.url ?? "")} ${res.statusCode}`,
    customErrorMessage: (req, res) => `${req.method} ${redactUrl(req.url ?? "")} ${res.statusCode}`,
  });
}
