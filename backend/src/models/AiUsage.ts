import mongoose, { Schema } from "mongoose";

/** One row per Groq call: what it cost and how it went. Kept 90 days. */
const AiUsageSchema = new Schema(
  {
    operation: { type: String, required: true },
    model: { type: String },
    promptTokens: { type: Number, default: 0 },
    completionTokens: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },
    latencyMs: { type: Number },
    ok: { type: Boolean, required: true },
    error: { type: String },
    createdAt: { type: Date, default: () => new Date() },
  },
  { versionKey: false }
);

AiUsageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export default mongoose.model("AiUsage", AiUsageSchema);
