import mongoose, { Schema, Document, Types } from "mongoose";

export type ProposalStatus =
  | "draft"
  | "sent"
  | "processing"
  | "accepted"
  | "changes_requested"
  | "rejected"
  | "expired";

export interface IMilestone {
  title: string;
  description: string;
  amount: number;      // in cents
  dueWeek: number;     // e.g. week 2, week 4
  order: number;
}

export interface IProposal extends Document {
  proposalToken: string;
  taskRequestId: Types.ObjectId;
  clientName: string;
  clientEmail: string;
  title: string;
  // Old fields (kept for backwards compatibility)
  introduction: string;
  scopeItems: string[];
  timeline: string;
  totalAmount: number;
  currency: string;
  milestones: IMilestone[];
  terms: string;
  
  // New Agency SOW discrete fields
  executiveSummary: string;
  scopeOfWork: string;
  deliverables: string;
  pricingBreakdown: string;
  revisionsPolicy: string;
  clientResponsibilities: string;
  supportAndWarranty: string;
  paymentTerms: string;
  nextSteps: string;

  status: ProposalStatus;
  aiDrafted: boolean;
  expiresAt: Date;
  acceptedAt?: Date;
  /** Contract generated when the client accepted */
  contractToken?: string;
  clientNote?: string;         // message from client on change request
  createdAt: Date;
  updatedAt: Date;
}

const MilestoneSchema = new Schema<IMilestone>(
  {
    title:       { type: String, required: true },
    description: { type: String, default: "" },
    amount:      { type: Number, required: true },   // cents
    dueWeek:     { type: Number, default: 0 },
    order:       { type: Number, default: 0 },
  },
  { _id: false }
);

const ProposalSchema = new Schema<IProposal>(
  {
    proposalToken:  { type: String, required: true, unique: true, index: true },
    taskRequestId:  { type: Schema.Types.ObjectId, ref: "TaskRequest", required: true },
    clientName:     { type: String, default: "" },
    clientEmail:    { type: String, required: true, lowercase: true, trim: true },
    title:          { type: String, required: true },
    
    // Old fields
    introduction:   { type: String, default: "" },
    scopeItems:     [{ type: String }],
    timeline:       { type: String, default: "" },
    totalAmount:    { type: Number, required: true },   // cents
    currency:       { type: String, default: "usd" },
    milestones:     [MilestoneSchema],
    terms:          { type: String, default: "" },

    // New Agency SOW discrete fields
    executiveSummary:          { type: String, default: "" },
    scopeOfWork:               { type: String, default: "" },
    deliverables:              { type: String, default: "" },
    pricingBreakdown:          { type: String, default: "" },
    revisionsPolicy:           { type: String, default: "" },
    clientResponsibilities:    { type: String, default: "" },
    supportAndWarranty:        { type: String, default: "" },
    paymentTerms:              { type: String, default: "" },
    nextSteps:                 { type: String, default: "" },
    status: {
      type: String,
      enum: ["draft", "sent", "processing", "accepted", "changes_requested", "rejected", "expired"],
      default: "draft",
    },
    aiDrafted:   { type: Boolean, default: false },
    expiresAt:   { type: Date, required: true },
    acceptedAt:  { type: Date },
    clientNote:  { type: String, default: "" },
    contractToken: { type: String },
  },
  { timestamps: true }
);

ProposalSchema.index({ taskRequestId: 1 });
ProposalSchema.index({ clientEmail: 1 });

export default mongoose.model<IProposal>("Proposal", ProposalSchema);
