import mongoose, { Document, Schema, Types } from "mongoose";

/** One row per subscriber snapshotted when a campaign is queued; the dispatcher works through the pending ones. */
export type RecipientStatus = "pending" | "sent" | "failed";

export interface ICampaignRecipient extends Document {
  campaignId: Types.ObjectId;
  email: string;
  unsubscribeUrl: string;
  status: RecipientStatus;
  error?: string;
  sentAt?: Date;
}

const CampaignRecipientSchema = new Schema<ICampaignRecipient>(
  {
    campaignId: { type: Schema.Types.ObjectId, ref: "Campaign", required: true },
    email: { type: String, required: true },
    unsubscribeUrl: { type: String, required: true },
    status: { type: String, enum: ["pending", "sent", "failed"], default: "pending" },
    error: { type: String },
    sentAt: { type: Date },
  },
  { timestamps: true }
);

// One row per address per campaign; the dispatcher reads pending rows in _id order
CampaignRecipientSchema.index({ campaignId: 1, email: 1 }, { unique: true });
CampaignRecipientSchema.index({ campaignId: 1, status: 1, _id: 1 });

export default mongoose.model<ICampaignRecipient>("CampaignRecipient", CampaignRecipientSchema);
