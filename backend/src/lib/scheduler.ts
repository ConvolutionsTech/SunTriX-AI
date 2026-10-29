import cron from "node-cron";
import Post from "../models/Post";
import Portfolio from "../models/Portfolio";
import AuditLog from "../models/AuditLog";
import Proposal from "../models/Proposal";
import Contract from "../models/Contract";
import { getSetting } from "./configLoader";

const STALE_PROCESSING_MS = 10 * 60 * 1000;

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
    console.log(`[Scheduler] Expired ${proposals.modifiedCount} proposal(s), ${contracts.modifiedCount} contract(s); released ${stuck.modifiedCount} stuck acceptance(s)`);
  }
}

export function startScheduler(): void {
  // ── Every 5 minutes: finish post-payment work that failed the first time ───
  cron.schedule("*/5 * * * *", async () => {
    try {
      const { paymentService } = await import("../modules/payments/payment.service");
      const done = await paymentService.reconcilePaidPayments();
      if (done > 0) console.log(`[Scheduler] Completed post-payment work for ${done} payment(s)`);
    } catch (err) {
      console.error("[Scheduler] Error during payment reconciliation:", err);
    }
  });

  // ── Every 5 minutes: expire proposals/contracts, release stuck acceptances ─
  cron.schedule("*/5 * * * *", () => {
    expireLifecycleDocuments().catch((err) => console.error("[Scheduler] Error during lifecycle expiry:", err));
  });

  // ── Every 5 minutes: auto-publish scheduled content ────────────
  cron.schedule("*/5 * * * *", async () => {
    const now = new Date();
    try {
      // Auto-publish scheduled blog posts
      const postsResult = await Post.updateMany(
        { status: "scheduled", publishAt: { $lte: now } },
        { status: "published", publishedAt: now }
      );
      if (postsResult.modifiedCount > 0) {
        console.log(`[Scheduler] Auto-published ${postsResult.modifiedCount} blog post(s)`);
      }

      // Auto-publish scheduled portfolio items
      const portfolioResult = await Portfolio.updateMany(
        { status: "draft", publishAt: { $lte: now } },
        { status: "published" }
      );
      if (portfolioResult.modifiedCount > 0) {
        console.log(`[Scheduler] Auto-published ${portfolioResult.modifiedCount} portfolio item(s)`);
      }
    } catch (err) {
      console.error("[Scheduler] Error during auto-publish:", err);
    }
  });

  // ── Daily at 2:00 AM: audit log retention cleanup ──────────────
  cron.schedule("0 2 * * *", async () => {
    try {
      const retentionDays = parseInt(getSetting("AUDIT_LOG_RETENTION_DAYS", "90"));
      if (retentionDays <= 0) return; // 0 means keep forever
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      const result = await AuditLog.deleteMany({ createdAt: { $lt: cutoffDate } });
      if (result.deletedCount > 0) {
        console.log(`[Scheduler] Pruned ${result.deletedCount} audit log entries older than ${retentionDays} days`);
      }
    } catch (err) {
      console.error("[Scheduler] Error during audit log cleanup:", err);
    }
  });

  console.log("[Scheduler] Jobs started: auto-publish (*/5 min), audit cleanup (daily 2am)");
}

