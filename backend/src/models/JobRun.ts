import mongoose, { Schema } from "mongoose";

/** One row per scheduled-job execution (on whichever instance won the lock). Kept 30 days. */
const JobRunSchema = new Schema(
  {
    name: { type: String, required: true },
    instance: { type: String, required: true },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date },
    ok: { type: Boolean },
    error: { type: String },
    result: { type: Schema.Types.Mixed },
  },
  { versionKey: false }
);

JobRunSchema.index({ name: 1, startedAt: -1 });
JobRunSchema.index({ startedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export default mongoose.model("JobRun", JobRunSchema);
