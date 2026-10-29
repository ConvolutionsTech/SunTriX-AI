import mongoose, { Schema, Document, Types } from "mongoose";
import { v4 as uuidv4 } from "uuid";

export type PhaseEnum = "Discovery" | "Design" | "Development" | "Testing" | "Delivery";
export type DeliverableStatus = "Pending" | "InReview" | "Approved" | "Rejected";
export type UpdateType = "ProgressUpdate" | "Blocker" | "MilestoneReached" | "ActionRequired";
export type FileApprovalStatus = "Pending" | "Approved" | "Rejected";

export interface IProjectTracker extends Document {
  taskRequestId: Types.ObjectId;
  proposalId: Types.ObjectId;
  trackerToken: string;
  currentPhase: PhaseEnum;
  
  phases: Types.DocumentArray<{
    name: PhaseEnum;
    enteredAt: Date;
    completedAt?: Date;
    adminNote?: string;
  }>;

  deliverables: Types.DocumentArray<{
    _id?: Types.ObjectId;
    title: string;
    status: DeliverableStatus;
    attachedUrl?: string;
    version: number;
    clientApprovedAt?: Date;
    clientRejectionNote?: string;
  }>;

  milestones: Types.DocumentArray<{
    _id?: Types.ObjectId;
    title: string;
    amount: number; // stored in cents
    linkedPhase: PhaseEnum;
    dueDate: Date;
    paymentRequestedAt?: Date;     // set when admin sends payment request
    paidAt?: Date;
    stripePaymentIntentId?: string;
    invoiceId?: Types.ObjectId;
  }>;

  updates: Types.DocumentArray<{
    _id?: Types.ObjectId;
    type: UpdateType;
    body: string;
    postedAt: Date;
    nextUpdateDue?: Date;
    clientAcknowledgedAt?: Date;
  }>;

  files: Types.DocumentArray<{
    _id?: Types.ObjectId;
    filename: string;
    cloudinaryUrl: string;
    cloudinaryPublicId: string;
    version: number;
    uploadedAt: Date;
    approvalStatus: FileApprovalStatus;
    clientComment?: string;
    approvedAt?: Date;
  }>;

  messages: Types.DocumentArray<{
    _id?: Types.ObjectId;
    sender: "Admin" | "Client";
    text: string;
    sentAt: Date;
    readByClient: boolean;
    readByAdmin: boolean;
  }>;

  auditLog: Types.DocumentArray<{
    _id?: Types.ObjectId;
    action: string;
    actor: string;
    actorRole: "Admin" | "Client" | "System";
    timestamp: Date;
    metadata?: Record<string, any>;
  }>;

  completionRequestedAt?: Date;  // set when admin requests final sign-off
  completionApprovedAt?: Date;   // set when client approves completion
  createdAt: Date;
  updatedAt: Date;
}

const ProjectTrackerSchema = new Schema<IProjectTracker>(
  {
    taskRequestId: { type: Schema.Types.ObjectId, ref: "TaskRequest", required: true },
    proposalId: { type: Schema.Types.ObjectId, ref: "Proposal", required: true },
    trackerToken: { type: String, unique: true, default: uuidv4, index: true },
    currentPhase: { 
      type: String, 
      enum: ["Discovery", "Design", "Development", "Testing", "Delivery"], 
      default: "Discovery" 
    },
    phases: [{
      name: { type: String, enum: ["Discovery", "Design", "Development", "Testing", "Delivery"] },
      enteredAt: { type: Date, default: Date.now },
      completedAt: { type: Date },
      adminNote: { type: String, default: "" },
    }],
    deliverables: [{
      title: { type: String, required: true },
      status: { type: String, enum: ["Pending", "InReview", "Approved", "Rejected"], default: "Pending" },
      attachedUrl: { type: String, default: "" },
      version: { type: Number, default: 1 },
      clientApprovedAt: { type: Date },
      clientRejectionNote: { type: String, default: "" },
    }],
    milestones: [{
      title: { type: String, required: true },
      amount: { type: Number, required: true }, // cents
      linkedPhase: { type: String, enum: ["Discovery", "Design", "Development", "Testing", "Delivery"] },
      dueDate: { type: Date, required: true },
      paymentRequestedAt: { type: Date },
      paidAt: { type: Date },
      stripePaymentIntentId: { type: String, default: "" },
      invoiceId: { type: Schema.Types.ObjectId, ref: "Payment" },
    }],
    updates: [{
      type: { type: String, enum: ["ProgressUpdate", "Blocker", "MilestoneReached", "ActionRequired"], required: true },
      body: { type: String, required: true },
      postedAt: { type: Date, default: Date.now },
      nextUpdateDue: { type: Date },
      clientAcknowledgedAt: { type: Date },
    }],
    files: [{
      filename: { type: String, required: true },
      cloudinaryUrl: { type: String, required: true },
      cloudinaryPublicId: { type: String, required: true },
      version: { type: Number, default: 1 },
      uploadedAt: { type: Date, default: Date.now },
      approvalStatus: { type: String, enum: ["Pending", "Approved", "Rejected"], default: "Pending" },
      clientComment: { type: String, default: "" },
      approvedAt: { type: Date },
    }],
    messages: [{
      sender: { type: String, enum: ["Admin", "Client"], required: true },
      text: { type: String, required: true },
      sentAt: { type: Date, default: Date.now },
      readByClient: { type: Boolean, default: false },
      readByAdmin: { type: Boolean, default: true },
    }],
    auditLog: [{
      action: { type: String, required: true },
      actor: { type: String, required: true },
      actorRole: { type: String, enum: ["Admin", "Client", "System"], required: true },
      timestamp: { type: Date, default: Date.now },
      metadata: { type: Schema.Types.Mixed },
    }],
    completionRequestedAt: { type: Date },
    completionApprovedAt: { type: Date },
  },
  { timestamps: true }
);

ProjectTrackerSchema.index({ taskRequestId: 1 }, { unique: true });
ProjectTrackerSchema.index({ proposalId: 1 });

export default mongoose.model<IProjectTracker>("ProjectTracker", ProjectTrackerSchema);
