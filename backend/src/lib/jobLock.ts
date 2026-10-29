import { randomUUID } from "crypto";
import SchedulerLock from "../models/SchedulerLock";
import JobRun from "../models/JobRun";
import { logger } from "./logger";

const instance = `${process.pid}-${randomUUID().slice(0, 8)}`;

/**
 * Take the lease for `name` for `holdMs`. The lease is not released early: it
 * covers the whole tick, so other instances firing the same cron skip it.
 */
export async function acquireLock(name: string, holdMs: number, owner = instance): Promise<boolean> {
  const now = new Date();
  try {
    const doc = await SchedulerLock.findOneAndUpdate(
      { _id: name, lockedUntil: { $lte: now } },
      { $set: { owner, lockedUntil: new Date(now.getTime() + holdMs) } },
      { upsert: true, new: true }
    ).lean();
    return doc?.owner === owner;
  } catch (err) {
    // Upsert raced with a live lock (duplicate _id): someone else holds it
    if ((err as { code?: number }).code === 11000) return false;
    throw err;
  }
}

/** Run a scheduled job on one instance per tick and record the run. Returns false when skipped. */
export async function runExclusive<T>(name: string, holdMs: number, fn: () => Promise<T>, owner = instance): Promise<boolean> {
  if (!(await acquireLock(name, holdMs, owner))) return false;
  const run = await JobRun.create({ name, instance: owner, startedAt: new Date() });
  try {
    const result = await fn();
    await JobRun.updateOne({ _id: run._id }, { $set: { finishedAt: new Date(), ok: true, ...(result !== undefined && { result }) } });
  } catch (err) {
    await JobRun.updateOne({ _id: run._id }, { $set: { finishedAt: new Date(), ok: false, error: (err as Error).message?.slice(0, 500) } });
    logger.error({ err, job: name }, `[Scheduler] Job ${name} failed`);
  }
  return true;
}
