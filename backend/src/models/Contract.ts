import mongoose, { Schema, Document, Types } from "mongoose";

export interface IContract extends Document {
  contractToken: string;
  taskRequestId: Types.ObjectId;
  proposalId: Types.ObjectId;
  clientName: string;
  clientEmail: string;
  // AI-generated contract body (plain text with sections)
  projectTitle: string;
  totalAmount: number;
  currency: string;
  scopeSummary: string;
  deliverablesText: string;
  timelineText: string;
  paymentTermsText: string;   // milestone structure summary
  revisionPolicy: string;
  warranties: string;
  governingLaw: string;
  fullContractText: string;   // the full rendered contract (AI generated)
  // Signing
  status: "pending" | "signed" | "expired";
  signedAt?: Date;
  clientSignatureName: string;  // typed full name
  clientIp?: string;            // captured on sign for legal evidence
  userAgent?: string;           // browser/device info
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ContractSchema = new Schema<IContract>(
  {
    contractToken:  { type: String, required: true, unique: true, index: true },
    taskRequestId:  { type: Schema.Types.ObjectId, ref: "TaskRequest", required: true },
    proposalId:     { type: Schema.Types.ObjectId, ref: "Proposal", required: true },
    clientName:     { type: String, default: "" },
    clientEmail:    { type: String, required: true, lowercase: true, trim: true },
    projectTitle:   { type: String, default: "" },
    totalAmount:    { type: Number, default: 0 },      // integer cents, copied from the accepted proposal
    currency:       { type: String, default: "usd" },
    scopeSummary:   { type: String, default: "" },
    deliverablesText:  { type: String, default: "" },
    timelineText:      { type: String, default: "" },
    paymentTermsText:  { type: String, default: "" },
    revisionPolicy:    { type: String, default: "" },
    warranties:        { type: String, default: "" },
    governingLaw:      { type: String, default: "" },
    fullContractText:  { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "signed", "expired"],
      default: "pending",
    },
    signedAt:            { type: Date },
    clientSignatureName: { type: String, default: "" },
    clientIp:            { type: String, default: "" },
    userAgent:           { type: String, default: "" },
    expiresAt:           { type: Date, required: true },
  },
  { timestamps: true }
);

ContractSchema.index({ taskRequestId: 1 });
// Exactly one contract per proposal, even under concurrent or repeated accepts
ContractSchema.index({ proposalId: 1 }, { unique: true });
ContractSchema.index({ clientEmail: 1 });

ContractSchema.index({ status: 1, expiresAt: 1 }); // expiry job

export default mongoose.model<IContract>("Contract", ContractSchema);
