import mongoose, { Schema, Document } from "mongoose";

/** Stripe events already received — makes webhook handling idempotent. */
export interface IWebhookEvent extends Document<string> {
  _id: string; // Stripe event id
  type: string;
  receivedAt: Date;
  processedAt?: Date;
  error?: string;
}

const WebhookEventSchema = new Schema<IWebhookEvent>({
  _id: { type: String, required: true },
  type: { type: String, required: true },
  receivedAt: { type: Date, default: Date.now },
  processedAt: { type: Date },
  error: { type: String },
});

// Stripe retries for up to 3 days; keep a month for investigation
WebhookEventSchema.index({ receivedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export default mongoose.model<IWebhookEvent>("WebhookEvent", WebhookEventSchema);
