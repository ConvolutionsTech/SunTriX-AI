import { randomUUID } from "crypto";
import { Types } from "mongoose";
import Campaign, { ICampaign } from "../models/Campaign";
import CampaignRecipient from "../models/CampaignRecipient";
import { sendNewsletterBatch, sendCampaignFailureNotification, getNewsletterBatchSize, BroadcastRecipient } from "../services/email";
import { logger } from "../lib/logger";

/**
 * Durable newsletter delivery. A campaign is a list of CampaignRecipient rows;
 * a worker leases one campaign at a time (lockedUntil), sends its pending
 * recipients in batches and records each outcome. If the process dies, the
 * lease expires and the next run (on any instance) carries on where it stopped.
 */
const LEASE_MS = 120_000;

/**
 * Snapshot the audience and queue the campaign for the dispatcher. The first
 * `alreadySent` recipients are recorded as sent (legacy campaigns resumed by count).
 */
export async function queueCampaignRecipients(campaignId: Types.ObjectId | string, recipients: BroadcastRecipient[], alreadySent = 0): Promise<void> {
  const unique = [...new Map(recipients.map((r) => [r.email.toLowerCase(), r])).values()];
  if (unique.length) {
    await CampaignRecipient.insertMany(
      unique.map((r, i) => ({ campaignId, email: r.email, unsubscribeUrl: r.unsubscribeUrl, status: i < alreadySent ? "sent" : "pending" })),
      { ordered: false }
    ).catch((err) => {
      if (err?.code !== 11000 && !err?.writeErrors) throw err; // re-queueing the same address is fine
    });
  }
}

async function claimCampaign(now: Date, workerId: string): Promise<ICampaign | null> {
  return Campaign.findOneAndUpdate(
    {
      status: { $in: ["queued", "sending"] },
      $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: null }, { lockedUntil: { $lte: now } }],
    },
    { $set: { status: "sending", lockedUntil: new Date(now.getTime() + LEASE_MS), workerId } },
    { sort: { createdAt: 1 }, new: true }
  );
}

/** Extend our lease; false means another worker took the campaign over. */
async function renewLease(campaignId: Types.ObjectId, workerId: string): Promise<boolean> {
  const res = await Campaign.updateOne({ _id: campaignId, workerId, status: "sending" }, { $set: { lockedUntil: new Date(Date.now() + LEASE_MS) } });
  return res.modifiedCount === 1;
}

async function finish(campaign: ICampaign, workerId: string): Promise<void> {
  const [sent, failed] = await Promise.all([
    CampaignRecipient.countDocuments({ campaignId: campaign._id, status: "sent" }),
    CampaignRecipient.countDocuments({ campaignId: campaign._id, status: "failed" }),
  ]);
  const status = failed === 0 ? "sent" : sent === 0 ? "failed" : "partially_failed";
  const lastError = failed ? (await CampaignRecipient.findOne({ campaignId: campaign._id, status: "failed" }).select("error").lean())?.error : undefined;
  await Campaign.updateOne(
    { _id: campaign._id, workerId },
    {
      $set: { status, sentCount: sent, failedCount: failed, errorMessage: lastError?.slice(0, 500) ?? "", ...(sent > 0 && { sentAt: new Date() }) },
      $unset: { lockedUntil: 1, workerId: 1 },
    }
  );
  logger.info({ campaignId: String(campaign._id), sent, failed }, `[Newsletter] Campaign ${status}`);
  if (failed > 0) {
    await sendCampaignFailureNotification({ subject: campaign.subject, sentCount: sent, totalCount: sent + failed, errorMessage: lastError ?? "Unknown error" });
  }
}

async function processCampaign(campaign: ICampaign, workerId: string): Promise<void> {
  const batchSize = getNewsletterBatchSize();
  for (;;) {
    const batch = await CampaignRecipient.find({ campaignId: campaign._id, status: "pending" }).sort({ _id: 1 }).limit(batchSize).lean();
    if (batch.length === 0) break;

    const ids = batch.map((r) => r._id);
    const { error } = await sendNewsletterBatch(campaign.subject, campaign.htmlBody, batch, `campaign-${campaign._id}-${ids[0]}-${ids.length}`);
    if (error) {
      await CampaignRecipient.updateMany({ _id: { $in: ids } }, { $set: { status: "failed", error: error.slice(0, 500) } });
    } else {
      await CampaignRecipient.updateMany({ _id: { $in: ids } }, { $set: { status: "sent", sentAt: new Date() }, $unset: { error: 1 } });
    }
    const sent = await CampaignRecipient.countDocuments({ campaignId: campaign._id, status: "sent" });
    await Campaign.updateOne({ _id: campaign._id }, { $set: { sentCount: sent } });
    if (!(await renewLease(campaign._id, workerId))) {
      logger.warn({ campaignId: String(campaign._id) }, "[Newsletter] Lost the campaign lease — another worker continues");
      return;
    }
  }
  await finish(campaign, workerId);
}

/** One worker per process; tests create more to simulate other instances. */
export function createCampaignDispatcher(workerId = `${process.pid}-${randomUUID().slice(0, 8)}`): () => Promise<number> {
  let running = false;
  return async () => {
    if (running) return 0;
    running = true;
    let handled = 0;
    try {
      let campaign: ICampaign | null;
      while ((campaign = await claimCampaign(new Date(), workerId))) {
        try {
          await processCampaign(campaign, workerId);
        } catch (err) {
          // Leave the lease to expire so the campaign is picked up again
          logger.error({ err, campaignId: String(campaign._id) }, "[Newsletter] Campaign dispatch crashed");
        }
        handled++;
      }
      return handled;
    } finally {
      running = false;
    }
  };
}

/** Deliver every queued campaign (one at a time). Safe to call from several instances. */
export const dispatchCampaigns = createCampaignDispatcher();

/** Retry: failed recipients go back to pending and the campaign is queued again. */
export async function requeueFailedRecipients(campaignId: Types.ObjectId | string): Promise<number> {
  const res = await CampaignRecipient.updateMany({ campaignId, status: "failed" }, { $set: { status: "pending" }, $unset: { error: 1 } });
  return res.modifiedCount;
}
