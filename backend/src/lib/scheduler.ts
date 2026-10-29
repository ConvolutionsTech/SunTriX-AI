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

export function startScheduler(): void {
  const schedule = (expr: string, fn: () => unknown) => tasks.push(cron.schedule(expr, fn));

  // ── Every 15 seconds: pick up settings changed on another instance ─────
  schedule("*/15 * * * * *", () => {
    refreshSettingsIfChanged().catch((err) => logger.error({ err }, "[Scheduler] Could not refresh settings"));
  });

  // ── Every 15 seconds: deliver queued email (retries with backoff) ──────
  schedule("*/15 * * * * *", () => {
    drainEmailOutbox().catch((err) => logger.error({ err }, "[Scheduler] Email outbox drain failed"));
  });

  // ── Every 30 seconds: deliver queued newsletter campaigns (resumes after crashes) ─
  schedule("*/30 * * * * *", () => {
    dispatchCampaigns().catch((err) => logger.error({ err }, "[Scheduler] Campaign dispatch failed"));
  });

  // ── Every 5 minutes: finish post-payment work that failed the first time ───
  schedule("*/5 * * * *", async () => {
    try {
      const { paymentService } = await import("../modules/payments/payment.service");
      const done = await paymentService.reconcilePaidPayments();
      if (done > 0) logger.info(`[Scheduler] Completed post-payment work for ${done} payment(s)`);
    } catch (err) {
      logger.error({ err }, "[Scheduler] Error during payment reconciliation");
    }
  });

  // ── Every 5 minutes: expire proposals/contracts, release stuck acceptances ─
  schedule("*/5 * * * *", () => {
    expireLifecycleDocuments().catch((err) => logger.error({ err }, "[Scheduler] Error during lifecycle expiry"));
    failInterruptedCampaigns().catch((err) => logger.error({ err }, "[Scheduler] Error while checking interrupted campaigns"));
  });

  // ── Every 5 minutes: auto-publish scheduled content ────────────
  schedule("*/5 * * * *", async () => {
    const now = new Date();
    try {
      // Auto-publish scheduled blog posts
      const postsResult = await Post.updateMany(
        { status: "scheduled", publishAt: { $lte: now } },
        { status: "published", publishedAt: now }
      );
      if (postsResult.modifiedCount > 0) {
        logger.info(`[Scheduler] Auto-published ${postsResult.modifiedCount} blog post(s)`);
      }

      // Auto-publish scheduled portfolio items
      const portfolioResult = await Portfolio.updateMany(
        { status: "draft", publishAt: { $lte: now } },
        { status: "published" }
      );
      if (portfolioResult.modifiedCount > 0) {
        logger.info(`[Scheduler] Auto-published ${portfolioResult.modifiedCount} portfolio item(s)`);
      }
    } catch (err) {
      logger.error({ err }, "[Scheduler] Error during auto-publish");
    }
  });

  // ── Daily at 2:00 AM: audit log retention cleanup ──────────────
  schedule("0 2 * * *", async () => {
    try {
      const retentionDays = parseInt(getSetting("AUDIT_LOG_RETENTION_DAYS", "90"));
      if (retentionDays <= 0) return; // 0 means keep forever
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      const result = await AuditLog.deleteMany({ createdAt: { $lt: cutoffDate } });
      if (result.deletedCount > 0) {
        logger.info(`[Scheduler] Pruned ${result.deletedCount} audit log entries older than ${retentionDays} days`);
      }
    } catch (err) {
      logger.error({ err }, "[Scheduler] Error during audit log cleanup");
    }
  });

  logger.info("[Scheduler] Jobs started: auto-publish (*/5 min), audit cleanup (daily 2am)");
}

/** Stops every cron job (graceful shutdown). */
export function stopScheduler(): void {
  for (const task of tasks) task.stop();
  tasks = [];
}
