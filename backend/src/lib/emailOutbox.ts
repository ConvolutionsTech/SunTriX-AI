import EmailLog, { IEmailLog } from "../models/EmailLog";
import { resendAdapter } from "../integrations/resend/resend.adapter";
import { getSetting } from "./configLoader";
import { logger } from "./logger";

export const MAX_EMAIL_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 30_000; // 30 s, 1 min, 2 min, 4 min
const LOCK_MS = 60_000;

export interface OutgoingEmail {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  attachments?: { filename: string; content: string }[];
}

let lastDrainAt: Date | null = null;
let draining = false;

export function emailConfigured(): boolean {
  return Boolean(getSetting("RESEND_API_KEY"));
}

export function outboxStatus(): { configured: boolean; lastDrainAt: string | null } {
  return { configured: emailConfigured(), lastDrainAt: lastDrainAt?.toISOString() ?? null };
}

/** Queue an email; the drain job delivers it within ~15 s and retries failures. */
export async function enqueueEmail(template: string, email: OutgoingEmail): Promise<{ id: string }> {
  const row = await EmailLog.create({ template, ...email, to: Array.isArray(email.to) ? email.to : [email.to] });
  return { id: String(row._id) };
}

/** Resend-shaped sender for a template, so existing senders only change their factory call. */
export function outbox(template: string) {
  return {
    send: async (email: OutgoingEmail): Promise<{ data: { id: string } | null; error: { message: string } | null }> => {
      try {
        return { data: await enqueueEmail(template, email), error: null };
      } catch (err) {
        return { data: null, error: { message: (err as Error).message } };
      }
    },
  };
}

/** Send now (for replies the admin waits on) and record the outcome in the log. */
export async function sendNow(template: string, email: OutgoingEmail): Promise<{ id?: string; error?: string }> {
  const to = Array.isArray(email.to) ? email.to : [email.to];
  if (!emailConfigured()) {
    await EmailLog.create({ template, ...email, to, status: "failed", attempts: 1, error: "EMAIL_NOT_CONFIGURED" });
    return { error: "Email is not configured (RESEND_API_KEY is not set)" };
  }
  const res = await resendAdapter.emails.send({ ...email, to });
  const error: string | undefined = res?.error?.message;
  await EmailLog.create({
    template, ...email, to, attempts: 1,
    status: error ? "failed" : "sent", error, providerId: res?.data?.id, sentAt: error ? undefined : new Date(),
  });
  return { id: res?.data?.id, error };
}

async function deliver(row: IEmailLog): Promise<void> {
  if (!emailConfigured()) {
    await EmailLog.updateOne({ _id: row._id }, { $set: { status: "failed", error: "EMAIL_NOT_CONFIGURED" }, $unset: { lockedUntil: 1 } });
    return;
  }
  let error: string | undefined;
  let providerId: string | undefined;
  try {
    const res = await resendAdapter.emails.send({ from: row.from, to: row.to, subject: row.subject, html: row.html, attachments: row.attachments });
    error = res?.error?.message;
    providerId = res?.data?.id;
  } catch (err) {
    error = (err as Error).message || "Send failed";
  }

  if (!error) {
    await EmailLog.updateOne({ _id: row._id }, { $set: { status: "sent", providerId, sentAt: new Date() }, $unset: { lockedUntil: 1, error: 1 } });
    return;
  }
  const exhausted = row.attempts >= MAX_EMAIL_ATTEMPTS;
  await EmailLog.updateOne(
    { _id: row._id },
    {
      $set: {
        status: exhausted ? "failed" : "queued",
        error: error.slice(0, 500),
        nextAttemptAt: new Date(Date.now() + BASE_BACKOFF_MS * 2 ** (row.attempts - 1)),
      },
      $unset: { lockedUntil: 1 },
    }
  );
  logger.warn({ emailLogId: String(row._id), template: row.template, attempt: row.attempts, err: error }, exhausted ? "Email failed permanently" : "Email failed — will retry");
}

/**
 * Claim due rows one at a time (atomic, so several instances can drain
 * together) and deliver them. Rows stuck in "sending" past their lock are
 * picked up again.
 */
export async function drainEmailOutbox(limit = 50): Promise<number> {
  if (draining) return 0;
  draining = true;
  let processed = 0;
  try {
    while (processed < limit) {
      const now = new Date();
      const row = await EmailLog.findOneAndUpdate(
        {
          $or: [
            { status: "queued", nextAttemptAt: { $lte: now } },
            { status: "sending", lockedUntil: { $lte: now } },
          ],
        },
        { $set: { status: "sending", lockedUntil: new Date(now.getTime() + LOCK_MS) }, $inc: { attempts: 1 } },
        { sort: { nextAttemptAt: 1 }, new: true }
      );
      if (!row) break;
      await deliver(row);
      processed++;
    }
    lastDrainAt = new Date();
    return processed;
  } finally {
    draining = false;
  }
}

/** Admin "retry": put a failed email back in the queue. */
export async function requeueEmail(id: string): Promise<boolean> {
  const res = await EmailLog.updateOne({ _id: id, status: "failed" }, { $set: { status: "queued", attempts: 0, nextAttemptAt: new Date() }, $unset: { error: 1 } });
  return res.modifiedCount === 1;
}
