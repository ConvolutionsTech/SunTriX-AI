import mongoose, { Schema } from "mongoose";

/** Daily counters (e.g. `ai-tokens:2026-10-29`, `chat:2026-10-29:<ip>`), removed two days after their day ends. */
const UsageCounterSchema = new Schema(
  {
    _id: { type: String },
    n: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false }
);

UsageCounterSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("UsageCounter", UsageCounterSchema);
