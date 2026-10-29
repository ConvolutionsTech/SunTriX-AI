import mongoose, { Schema, Document, Types } from "mongoose";

export type TaskStatus =
  | "new"
  | "in_review"
  | "proposal_sent"
  | "contract_sent"
  | "contract_signed"
  | "in_progress"
  | "completed"
  | "cancelled";

export type TaskRequestStatus = TaskStatus;

export interface ITaskRequest extends Document {
  name: string;
  email: string;
  phone: string;
  company: string;
  role: string;
  projectTitle: string;
  service: string;
  budget: string;
  timeline: string;
  description: string;
  priority: string;
  techStack: string;
  existingCode: string;
  codeDetails: string;
  integrations: string;
  notes: string;
  // Soft Delete fields
  deletedAt?: Date | null;
  deletedBy?: string;
  // Plan differentiation (from pricing page — fully dynamic, not hardcoded)
  selectedPlan: string;   // plan name exactly as admin configured it in /admin/pricing
  planBudget: number;     // plan's starting price in USD (0 if not from pricing page)
  // Proposal & contract flow
  proposalId?: Types.ObjectId;
  contractToken?: string;
  contractSignedAt?: Date;
  contractClientName?: string; // typed name as digital signature
  status: TaskStatus;
  trackingToken: string;
  statusHistory: { status: TaskStatus; note: string; updatedAt: Date }[];
  createdAt: Date;
  updatedAt: Date;
}

const TaskRequestSchema = new Schema<ITaskRequest>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, default: "" },
    company: { type: String, default: "" },
    role: { type: String, default: "" },
    projectTitle: { type: String, default: "" },
    service: { type: String, required: true },
    budget: { type: String, default: "" },
    timeline: { type: String, default: "" },
    description: { type: String, required: true },
    priority: { type: String, default: "Medium" },
    techStack: { type: String, default: "" },
    existingCode: { type: String, default: "No" },
    codeDetails: { type: String, default: "" },
    integrations: { type: String, default: "" },
    notes: { type: String, default: "" },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: String, default: "" },
    // Plan differentiation — dynamic from pricing page
    selectedPlan: { type: String, default: "" },
    planBudget:   { type: Number, default: 0 },
    // Proposal & contract flow
    proposalId:         { type: Schema.Types.ObjectId, ref: "Proposal", default: null },
    contractToken:      { type: String, default: "" },
    contractSignedAt:   { type: Date },
    contractClientName: { type: String, default: "" },
    status: {
      type: String,
      enum: ["new", "in_review", "proposal_sent", "contract_sent", "contract_signed", "in_progress", "completed", "cancelled"],
      default: "new",
    },
    trackingToken: { type: String, unique: true, sparse: true },
    statusHistory: [{
      status: String,
      note: String,
      updatedAt: { type: Date, default: Date.now },
    }],
  },
  { timestamps: true }
);

TaskRequestSchema.index({ status: 1, createdAt: -1 });
TaskRequestSchema.index({ email: 1 });
TaskRequestSchema.index({ contractToken: 1 });

TaskRequestSchema.index({ deletedAt: 1, status: 1, createdAt: -1 });

export default mongoose.model<ITaskRequest>("TaskRequest", TaskRequestSchema);
