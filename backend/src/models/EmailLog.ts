import mongoose, { Document, Schema } from "mongoose";

/**
 * Outbox + delivery log for transactional email. Senders queue a row; the
 * scheduler's drain job sends it with retries and records the outcome.
 */
export type EmailStatus = "queued" | "sending" | "sent" | "failed";

export interface IEmailLog extends Document {
  template: string;
  from: string;
  to: string[];
  subject: string;
  html: string;
  attachments?: { filename: string; content: string }[];
  status: EmailStatus;
  attempts: number;
  nextAttemptAt: Date;
  lockedUntil?: Date;
  providerId?: string;
  error?: string;
  sentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const EmailLogSchema = new Schema<IEmailLog>(
  {
    template: { type: String, required: true },
    from: { type: String, required: true },
    to: { type: [String], required: true },
    subject: { type: String, required: true },
    html: { type: String, required: true },
    attachments: { type: [{ _id: false, filename: String, content: String }], default: undefined },
    status: { type: String, enum: ["queued", "sending", "sent", "failed"], default: "queued" },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: () => new Date() },
    lockedUntil: { type: Date },
    providerId: { type: String },
    error: { type: String },
    sentAt: { type: Date },
  },
  { timestamps: true }
);

// Drain: due rows in order
EmailLogSchema.index({ status: 1, nextAttemptAt: 1 });
// Admin log: newest first, optionally by status
EmailLogSchema.index({ createdAt: -1 });
// Delivered mail (body + attachments) is kept for 90 days
EmailLogSchema.index({ sentAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60, partialFilterExpression: { status: "sent" } });

export default mongoose.model<IEmailLog>("EmailLog", EmailLogSchema);
