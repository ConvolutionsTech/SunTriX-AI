import { Router, Request, Response, NextFunction } from "express";
import crypto from "crypto";
import Newsletter, { newUnsubscribeToken } from "../models/Newsletter";
import Campaign from "../models/Campaign";
import { requireAuth, requireRole, AuthRequest } from "../middleware/auth";
import { createError } from "../middleware/errorHandler";
import { getSetting } from "../lib/configLoader";
import { sendNewsletterConfirmationEmail, sendNewsletterWelcomeEmail, BroadcastRecipient } from "../services/email";
import { validate, NewsletterSubscribeSchema, NewsletterBroadcastSchema } from "../middleware/validate";
import { logger } from "../lib/logger";
import { logAudit } from "../lib/audit";
import CampaignRecipient from "../models/CampaignRecipient";
import { dispatchCampaigns, queueCampaignRecipients, requeueFailedRecipients } from "../jobs/campaignDispatcher";

function kickDispatcher(): void {
  setImmediate(() => {
    dispatchCampaigns().catch((err) => logger.error({ err }, "[Newsletter] Dispatcher run failed"));
  });
}
import { formLimiter } from "../middleware/rateLimiters";

const router = Router();

// POST /newsletter — public subscribe.
// The response never reveals whether the address is already on the list, and an
// address is only marked subscribed by its owner (confirmation click) when
// double opt-in is on.
router.post("/", formLimiter(), validate(NewsletterSubscribeSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email, interest } = req.body;
    const doubleOptIn = getSetting("NEWSLETTER_DOUBLE_OPTIN", "false") === "true";
    const existing = await Newsletter.findOne({ email });

    if (!doubleOptIn) {
      if (existing) {
        Object.assign(existing, { name, interest, subscribed: true });
        await existing.save();
      } else {
        await Newsletter.create({ name, email, interest, subscribed: true });
      }
      return res.status(201).json({ message: "Subscribed successfully" });
    }

    const pending = { message: "Please check your email to confirm your subscription.", requiresConfirmation: true };
    if (existing?.subscribed) return res.status(201).json(pending);

    const confirmToken = crypto.randomBytes(32).toString("hex");
    const confirmTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    if (existing) {
      Object.assign(existing, { name, interest, confirmToken, confirmTokenExpiry });
      await existing.save();
    } else {
      await Newsletter.create({ name, email, interest, subscribed: false, confirmToken, confirmTokenExpiry });
    }

    const confirmUrl = `${getSetting("FRONTEND_URL", "http://localhost:5173")}/newsletter/confirm/${confirmToken}`;
    await sendNewsletterConfirmationEmail({ name, email, confirmUrl });
    res.status(201).json(pending);
  } catch (err) { next(err); }
});

// GET /newsletter/confirm/:token — public link clicked from confirmation email
router.get("/confirm/:token", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.params;
    if (!token) return next(createError("Token is required", 400));

    const subscriber = await Newsletter.findOne({ confirmToken: token });
    if (!subscriber) return next(createError("Invalid confirmation link.", 400));

    if (subscriber.confirmTokenExpiry && new Date() > subscriber.confirmTokenExpiry) {
      return next(createError("Confirmation link has expired. Please subscribe again.", 410));
    }

    if (subscriber.subscribed) {
      return res.json({ message: "Already subscribed!" });
    }

    subscriber.subscribed = true;
    subscriber.confirmToken = undefined;
    subscriber.confirmTokenExpiry = undefined;
    await subscriber.save();

    await sendNewsletterWelcomeEmail({
      name: subscriber.name,
      email: subscriber.email,
      interest: subscriber.interest,
    });

    res.json({ message: "Subscription confirmed! You will now receive our updates." });
  } catch (err) { next(err); }
});

// GET|POST /newsletter/unsubscribe/:token — public, no login (link in every campaign)
const unsubscribe = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const subscriber = await Newsletter.findOneAndUpdate(
      { unsubscribeToken: req.params.token },
      { $set: { subscribed: false } },
      { new: true }
    );
    if (!subscriber) return next(createError("This unsubscribe link is not valid.", 404));
    res.json({ message: "You've been unsubscribed and won't receive further emails." });
  } catch (err) { next(err); }
};
router.get("/unsubscribe/:token", unsubscribe);
router.post("/unsubscribe/:token", unsubscribe);

// GET /newsletter — admin subscribers list
router.get("/", requireAuth, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const subscribers = await Newsletter.find({ subscribed: true }).sort({ createdAt: -1 });
    res.json(subscribers);
  } catch (err) { next(err); }
});

// DELETE /newsletter/:id — admin remove subscriber
router.delete("/:id", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const removed = await Newsletter.findByIdAndDelete(req.params.id);
    if (removed) await logAudit(req, "delete", "subscriber", req.params.id, removed.email);
    res.json({ message: "Subscriber removed" });
  } catch (err) { next(err); }
});

// POST /newsletter/generate-template — AI template generation
router.post("/generate-template", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return next(createError("Prompt is required", 400));
    const { generateEmailTemplate } = await import("../services/groq");
    const htmlCode = await generateEmailTemplate(prompt);
    res.json({ html: htmlCode });
  } catch (err) { next(err); }
});

// GET /newsletter/campaigns — admin campaign history
router.get("/campaigns", requireAuth, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const campaigns = await Campaign.find().sort({ createdAt: -1 }).limit(50);
    res.json({ campaigns });
  } catch (err) { next(err); }
});

/** Recipients for an audience, in a stable order (so a retry can resume by count). */
async function audienceRecipients(targetAudience: string): Promise<BroadcastRecipient[]> {
  const query: Record<string, unknown> = { subscribed: true };
  if (targetAudience && targetAudience !== "All") query.interest = targetAudience;
  // Older subscribers predate unsubscribe tokens — give each one before sending
  const missing = await Newsletter.find({ ...query, unsubscribeToken: { $exists: false } }).select("_id").lean();
  if (missing.length) {
    await Newsletter.bulkWrite(
      missing.map((m) => ({
        updateOne: { filter: { _id: m._id, unsubscribeToken: { $exists: false } }, update: { $set: { unsubscribeToken: newUnsubscribeToken() } } },
      }))
    );
  }
  const subscribers = await Newsletter.find(query).sort({ _id: 1 }).select("email unsubscribeToken").lean();

  const frontendUrl = getSetting("FRONTEND_URL", "http://localhost:5173");
  return subscribers.map((s) => ({ email: s.email, unsubscribeUrl: `${frontendUrl}/newsletter/unsubscribe/${s.unsubscribeToken}` }));
}

const broadcastHandler = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { subject, body, targetAudience } = req.body as { subject: string; body: string; targetAudience: string };

    const recipients = await audienceRecipients(targetAudience);
    const emails = recipients.map((r) => r.email);
    if (emails.length === 0) return next(createError("No active subscribers found", 400));

    // Append admin-configured footer text if set
    const footerText = getSetting("NEWSLETTER_FOOTER_TEXT", "");
    const finalBody = footerText
      ? `${body}\n<div style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center;">${footerText}</div>`
      : body;

    // Snapshot the audience; the dispatcher (jobs/campaignDispatcher.ts) delivers it durably
    const campaign = await Campaign.create({
      subject,
      htmlBody: finalBody,
      targetAudience: targetAudience || "All",
      recipientCount: emails.length,
      adminId: req.user?.id || "unknown",
      adminName: req.user?.name || "Admin",
      status: "queued",
    });
    await queueCampaignRecipients(campaign._id, recipients);
    await logAudit(req, "broadcast", "campaign", campaign._id.toString(), subject, { recipients: emails.length, targetAudience });

    res.status(202).json({
      message: `Broadcast queued for ${emails.length} subscriber${emails.length !== 1 ? "s" : ""}. Sending in background.`,
      recipientCount: emails.length,
      campaignId: campaign._id.toString(),
      campaign,
      status: "queued",
    });

    // Start right away rather than waiting for the next scheduler tick
    kickDispatcher();
  } catch (err) { next(err); }
};

// POST /broadcast and POST /campaigns create and send a new campaign
router.post("/broadcast", requireAuth, requireRole("admin"), validate(NewsletterBroadcastSchema), broadcastHandler);
router.post("/campaigns", requireAuth, requireRole("admin"), validate(NewsletterBroadcastSchema), broadcastHandler);

// ─────────────────────────────────────────────────────────────────
// ADMIN: POST /newsletter/admin/campaigns/:id/retry
// Retries a failed campaign. Only sends to recipients that haven't received it yet.
// ─────────────────────────────────────────────────────────────────
router.post("/admin/campaigns/:id/retry", requireAuth, requireRole("admin"), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return next(createError("Campaign not found", 404));
    if (campaign.status !== "failed" && campaign.status !== "partially_failed") {
      return next(createError("Only failed campaigns can be retried", 400));
    }

    let requeued: number;
    if (await CampaignRecipient.exists({ campaignId: campaign._id })) {
      requeued = await requeueFailedRecipients(campaign._id);
    } else {
      // Campaign from before per-recipient tracking: resume after the sent count, same order as the original send
      const audience = await audienceRecipients(campaign.targetAudience);
      await queueCampaignRecipients(campaign._id, audience, campaign.sentCount);
      requeued = Math.max(audience.length - campaign.sentCount, 0);
    }

    if (requeued === 0) {
      campaign.status = "sent";
      campaign.sentAt = campaign.sentAt ?? new Date();
      await campaign.save();
      return res.json({ message: "Campaign was already fully sent", campaign });
    }

    campaign.status = "queued";
    campaign.errorMessage = "";
    await campaign.save();
    await logAudit(req, "broadcast", "campaign", campaign._id.toString(), `Retry: ${campaign.subject}`, { recipients: requeued });

    res.json({
      message: `Retrying campaign for ${requeued} subscriber(s). Sending in background.`,
      campaignId: campaign._id.toString(),
      status: "queued",
    });
    kickDispatcher();
  } catch (err) { next(err); }
});

export default router;

