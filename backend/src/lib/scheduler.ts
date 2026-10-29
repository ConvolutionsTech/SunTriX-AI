import cron, { ScheduledTask } from "node-cron";
import Post from "../models/Post";
import Portfolio from "../models/Portfolio";
import AuditLog from "../models/AuditLog";
import Proposal from "../models/Proposal";
import Contract from "../models/Contract";
import Campaign from "../models/Campaign";
import { getSetting, refreshSettingsIfChanged } from "./configLoader";
import { logger } from "./logger";
import { drainEmailOutbox } from "./emailOutbox";
import { dispatchCampaigns } from "../jobs/campaignDispatcher";
import { runExclusive } from "./jobLock";

const STALE_PROCESSING_MS = 10 * 60 * 1000;
// Campaigns from before the durable dispatcher ran in the memory of one process
// (no lease); one that hasn't finished after this long was lost to a restart.
const STALE_CAMPAIGN_MS = 30 * 60 * 1000;

let tasks: ScheduledTask[] = [];

/** Marks legacy (lease-less) campaigns orphaned by a restart as failed so the admin can retry them. */
export async function failInterruptedCampaigns(now = new Date()): Promise<number> {
  const result = await Campaign.updateMany(
    { status: { $in: ["pending", "sending"] }, lockedUntil: { $exists: false }, updatedAt: { $lt: new Date(now.getTime() - STALE_CAMPAIGN_MS) } },
    { $set: { status: "failed", errorMessage: "Interrupted by a server restart — use Retry to send to the remaining recipients." } }
  );
  if (result.modifiedCount > 0) logger.warn(`[Scheduler] Marked ${result.modifiedCount} interrupted campaign(s) as failed`);
  return result.modifiedCount;
}

/**
 * Proposals and contracts past their expiry stop being actionable, and an
 * acceptance left in "processing" by a crash is released so the client can retry.
 */
export async function expireLifecycleDocuments(now = new Date()): Promise<void> {
  const proposals = await Proposal.updateMany({ status: { $in: ["sent", "changes_requested"] }, expiresAt: { $lt: now } }, { $set: { status: "expired" } });
  const contracts = await Contract.updateMany({ status: "pending", expiresAt: { $lt: now } }, { $set: { status: "expired" } });
  const stuck = await Proposal.updateMany(
    { status: "processing", updatedAt: { $lt: new Date(now.getTime() - STALE_PROCESSING_MS) } },
    { $set: { status: "sent" } }
  );
  const total = proposals.modifiedCount + contracts.modifiedCount + stuck.modifiedCount;
  if (total > 0) {
    logger.info(`[Scheduler] Expired ${proposals.modifiedCount} proposal(s), ${contracts.modifiedCount} contract(s); released ${stuck.modifiedCount} stuck acceptance(s)`);
  }
}

/** Publish blog posts and portfolio items whose scheduled time has come. */
export async function autoPublishScheduledContent(now = new Date()): Promise<{ posts: number; portfolio: number }> {
  const posts = await Post.updateMany({ status: "scheduled", publishAt: { $lte: now } }, { $set: { status: "published", publishedAt: now } });
  // Only items explicitly scheduled: an item un-published later (draft, old publishAt) stays a draft
  const portfolio = await Portfolio.updateMany({ status: "scheduled", publishAt: { $lte: now } }, { $set: { status: "published" }, $unset: { publishAt: 1 } });
  if (posts.modifiedCount > 0) logger.info(`[Scheduler] Auto-published ${posts.modifiedCount} blog post(s)`);
  if (portfolio.modifiedCount > 0) logger.info(`[Scheduler] Auto-published ${portfolio.modifiedCount} portfolio item(s)`);
  return { posts: posts.modifiedCount, portfolio: portfolio.modifiedCount };
}

/** Delete audit entries older than AUDIT_LOG_RETENTION_DAYS (0 keeps them forever). */
export async function pruneAuditLog(now = new Date()): Promise<number> {
  const retentionDays = parseInt(getSetting("AUDIT_LOG_RETENTION_DAYS", "90"));
  if (!(retentionDays > 0)) return 0;
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const result = await AuditLog.deleteMany({ createdAt: { $lt: cutoff } });
  if (result.deletedCount > 0) logger.info(`[Scheduler] Pruned ${result.deletedCount} audit log entries older than ${retentionDays} days`);
  return result.deletedCount;
}

const FIVE_MIN_HOLD = 4 * 60 * 1000; // < the 5-minute period, so every tick runs exactly once across instances

export function startScheduler(): void {
  const schedule = (expr: string, fn: () => unknown) => tasks.push(cron.schedule(expr, fn));
  // Jobs that must run once per tick across all instances (recorded in JobRun)
  const exclusive = (expr: string, name: string, holdMs: number, fn: () => Promise<unknown>) =>
    schedule(expr, () => runExclusive(name, holdMs, fn).catch((err) => logger.error({ err, job: name }, "[Scheduler] Could not run job")));

  // ── Per instance (each has its own cache / is safe to run everywhere) ──
  schedule("*/15 * * * * *", () => {
    refreshSettingsIfChanged().catch((err) => logger.error({ err }, "[Scheduler] Could not refresh settings"));
  });
  // Outbox and dispatcher claim rows atomically, so every instance can help
  schedule("*/15 * * * * *", () => {
    drainEmailOutbox().catch((err) => logger.error({ err }, "[Scheduler] Email outbox drain failed"));
  });
  schedule("*/30 * * * * *", () => {
    dispatchCampaigns().catch((err) => logger.error({ err }, "[Scheduler] Campaign dispatch failed"));
  });

  // ── Once per tick across instances ─────────────────────────────────────
  exclusive("*/5 * * * *", "reconcile-payments", FIVE_MIN_HOLD, async () => {
    const { paymentService } = await import("../modules/payments/payment.service");
    const done = await paymentService.reconcilePaidPayments();
    if (done > 0) logger.info(`[Scheduler] Completed post-payment work for ${done} payment(s)`);
    return { done };
  });
  exclusive("*/5 * * * *", "expire-lifecycle", FIVE_MIN_HOLD, async () => {
    await expireLifecycleDocuments();
    return { interruptedCampaigns: await failInterruptedCampaigns() };
  });
  exclusive("*/5 * * * *", "auto-publish", FIVE_MIN_HOLD, () => autoPublishScheduledContent());
  exclusive("0 2 * * *", "audit-retention", 60 * 60 * 1000, async () => ({ deleted: await pruneAuditLog() }));

  logger.info("[Scheduler] Jobs started");
}

/** Stops every cron job (graceful shutdown). */
export function stopScheduler(): void {
  for (const task of tasks) task.stop();
  tasks = [];
}
