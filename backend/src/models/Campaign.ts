import mongoose, { Schema, Document } from "mongoose";

// queued → sending → sent | partially_failed | failed. "pending" is the legacy initial state.
export type CampaignStatus = "pending" | "queued" | "sending" | "sent" | "partially_failed" | "failed";

export interface ICampaign extends Document {
  subject: string;
  htmlBody: string;
  targetAudience: string;
  recipientCount: number;
  adminId: string;
  adminName: string;
  // Status tracking for async broadcast
  status: CampaignStatus;
  sentCount: number;        // partial success tracking
  errorMessage?: string;    // populated if status = "failed"
  sentAt?: Date;            // populated when status transitions to "sent"
  failedCount: number;
  lockedUntil?: Date;       // dispatcher lease; an expired lease is picked up by another worker
  workerId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CampaignSchema = new Schema<ICampaign>(
  {
    subject:         { type: String, required: true },
    htmlBody:        { type: String, required: true },
    targetAudience:  { type: String, default: "All" },
    recipientCount:  { type: Number, default: 0 },
    adminId:         { type: String, required: true },
    adminName:       { type: String, required: true },
    status:          { type: String, enum: ["pending", "queued", "sending", "sent", "partially_failed", "failed"], default: "queued" },
    sentCount:       { type: Number, default: 0 },
    errorMessage:    { type: String, default: "" },
    sentAt:          { type: Date },
    failedCount:     { type: Number, default: 0 },
    lockedUntil:     { type: Date },
    workerId:        { type: String },
  },
  { timestamps: true }
);

CampaignSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model<ICampaign>("Campaign", CampaignSchema);
