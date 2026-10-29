import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import Newsletter from "../models/Newsletter";
import TaskRequest from "../models/TaskRequest";
import { connectTestDb, disconnectTestDb } from "./helpers/db";

const usesIndex = (plan: unknown): boolean => JSON.stringify(plan).includes('"IXSCAN"');

describe("indexes (T-OPB-11)", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120000);

  afterAll(async () => {
    await disconnectTestDb();
  });

  it("newsletter audience and admin task lists are index scans", async () => {
    const newsletter = await Newsletter.find({ subscribed: true }).sort({ createdAt: -1 }).explain();
    expect(usesIndex(newsletter)).toBe(true);
    const tasks = await TaskRequest.find({ deletedAt: null, status: "new" }).sort({ createdAt: -1 }).explain();
    expect(usesIndex(tasks)).toBe(true);
  });

  it("no schema declares the same index twice", () => {
    for (const name of mongoose.modelNames()) {
      const keys = mongoose.model(name).schema.indexes().map(([fields]) => JSON.stringify(fields));
      expect(new Set(keys).size, `${name} has duplicate index definitions`).toBe(keys.length);
    }
  });
});
