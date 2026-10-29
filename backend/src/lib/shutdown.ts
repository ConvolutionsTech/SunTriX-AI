import type { Server } from "http";
import mongoose from "mongoose";
import { logger } from "./logger";
import { stopScheduler } from "./scheduler";
import { captureServerError, flushSentry } from "./sentry";

let shuttingDown = false;

/** True once a shutdown signal arrived: readiness fails so the load balancer drains us. */
export function isShuttingDown(): boolean {
  return shuttingDown;
}

/** Readiness: the database answers a ping within 2 s and we're not draining. */
export async function checkReadiness(): Promise<{ ready: true } | { ready: false; reason: string }> {
  if (shuttingDown) return { ready: false, reason: "shutting_down" };
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) return { ready: false, reason: "database_disconnected" };
  try {
    await Promise.race([
      mongoose.connection.db.admin().ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 2000).unref()),
    ]);
    return { ready: true };
  } catch {
    return { ready: false, reason: "database_unreachable" };
  }
}

interface ShutdownDeps {
  server?: Pick<Server, "close">;
  stopJobs?: () => void;
  disconnect?: () => Promise<unknown>;
  exit?: (code: number) => void;
  timeoutMs?: number;
}

/**
 * Stop taking traffic, let in-flight requests finish, stop cron jobs and close
 * the database, then exit. A hard timeout makes sure we never hang a deploy.
 */
export async function gracefulShutdown(signal: string, deps: ShutdownDeps = {}): Promise<void> {
  const { server, stopJobs = stopScheduler, disconnect = () => mongoose.disconnect(), exit = (c) => process.exit(c), timeoutMs = 10_000 } = deps;
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutting down");

  const timer = setTimeout(() => {
    logger.error("Shutdown timed out — forcing exit");
    exit(1);
  }, timeoutMs);
  timer.unref();

  try {
    stopJobs();
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    await disconnect();
    clearTimeout(timer);
    logger.info("Shutdown complete");
    exit(0);
  } catch (err) {
    clearTimeout(timer);
    logger.error({ err }, "Error during shutdown");
    exit(1);
  }
}

/** Wire signals and last-resort error handlers for the running server. */
export function registerProcessHandlers(server: Server): void {
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => void gracefulShutdown(signal, { server }));
  }
  // An unknown state is worse than a restart: log and let the orchestrator restart us.
  const crash = (err: unknown, msg: string) => {
    logger.fatal({ err }, msg);
    captureServerError(err, { status: 500 });
    void flushSentry().finally(() => process.exit(1));
  };
  process.on("unhandledRejection", (reason) => crash(reason, "Unhandled promise rejection"));
  process.on("uncaughtException", (err) => crash(err, "Uncaught exception"));
}

/** Test hook. */
export function resetShutdownState(): void {
  shuttingDown = false;
}
