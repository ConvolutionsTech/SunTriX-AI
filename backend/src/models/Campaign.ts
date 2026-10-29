import mongoose, { Schema, Document } from "mongoose";

export type CampaignStatus = "pending" | "sending" | "sent" | "failed";

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
    status:          { type: String, enum: ["pending", "sending", "sent", "failed"], default: "pending" },
    sentCount:       { type: Number, default: 0 },
    errorMessage:    { type: String, default: "" },
    sentAt:          { type: Date },
  },
  { timestamps: true }
);

CampaignSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model<ICampaign>("Campaign", CampaignSchema);
