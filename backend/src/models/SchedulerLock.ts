import mongoose, { Schema } from "mongoose";

/** Lease per job name, so a cron tick runs on one instance only. */
const SchedulerLockSchema = new Schema(
  {
    _id: { type: String },
    owner: { type: String, required: true },
    lockedUntil: { type: Date, required: true },
  },
  { versionKey: false }
);

export default mongoose.model("SchedulerLock", SchedulerLockSchema);
