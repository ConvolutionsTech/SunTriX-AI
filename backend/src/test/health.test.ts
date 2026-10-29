import { describe, it, expect, vi, afterEach } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import app from "../app";
import Campaign from "../models/Campaign";
import { gracefulShutdown, resetShutdownState } from "../lib/shutdown";
import { failInterruptedCampaigns } from "../lib/scheduler";
import { connectTestDb, disconnectTestDb } from "./helpers/db";

describe("liveness, readiness and graceful shutdown (T-OPB-9)", () => {
  afterEach(() => {
    resetShutdownState();
  });

  it("/ready follows the database while /health stays up", async () => {
    expect((await request(app).get("/ready")).status).toBe(503);
    const health = await request(app).get("/health");
    expect(health.status).toBe(200);
    expect(health.body).toEqual({ status: "ok" });

    await connectTestDb();
    expect((await request(app).get("/ready")).body).toEqual({ status: "ready" });

    await mongoose.disconnect();
    const down = await request(app).get("/ready");
    expect(down.status).toBe(503);
    expect(down.body.reason).toBe("database_disconnected");
    await disconnectTestDb();
  }, 120000);

  it("shutdown drains: readiness fails, jobs stop, server and DB close, exit 0", async () => {
    const order: string[] = [];
    const exit = vi.fn();
    await gracefulShutdown("SIGTERM", {
      server: { close: ((cb: () => void) => { order.push("server"); cb(); }) as any },
      stopJobs: () => order.push("jobs"),
      disconnect: async () => { order.push("db"); },
      exit,
    });
    expect(order).toEqual(["jobs", "server", "db"]);
    expect(exit).toHaveBeenCalledWith(0);
    const res = await request(app).get("/ready");
    expect(res.status).toBe(503);
    expect(res.body.reason).toBe("shutting_down");
  });

  it("a hung shutdown is forced out after the timeout", async () => {
    vi.useFakeTimers();
    const exit = vi.fn();
    void gracefulShutdown("SIGTERM", { server: { close: (() => {}) as any }, stopJobs: () => {}, disconnect: async () => {}, exit, timeoutMs: 100 });
    await vi.advanceTimersByTimeAsync(150);
    expect(exit).toHaveBeenCalledWith(1);
    vi.useRealTimers();
  });

  it("campaigns orphaned by a restart are marked failed; recent ones are left alone", async () => {
    await connectTestDb();
    const base = { subject: "s", htmlBody: "b", adminId: "a", adminName: "A" };
    const old = await Campaign.create({ ...base, status: "sending" });
    const fresh = await Campaign.create({ ...base, status: "sending" });
    await Campaign.collection.updateOne({ _id: old._id }, { $set: { updatedAt: new Date(Date.now() - 60 * 60 * 1000) } });

    expect(await failInterruptedCampaigns()).toBe(1);
    expect((await Campaign.findById(old._id))?.status).toBe("failed");
    expect((await Campaign.findById(fresh._id))?.status).toBe("sending");
    await disconnectTestDb();
  }, 120000);
});
