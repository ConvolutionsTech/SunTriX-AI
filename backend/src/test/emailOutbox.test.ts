import { describe, it, expect, vi, beforeAll, afterEach, afterAll } from "vitest";
import request from "supertest";
import app from "../app";
import EmailLog from "../models/EmailLog";
import { resendAdapter } from "../integrations/resend/resend.adapter";
import { drainEmailOutbox, MAX_EMAIL_ATTEMPTS } from "../lib/emailOutbox";
import { sendPasswordResetEmail } from "../services/email";
import { connectTestDb, clearTestDb, disconnectTestDb } from "./helpers/db";
import { staffToken } from "./helpers/auth";

const reset = () => sendPasswordResetEmail({ email: "owner@suntrix.test", name: "Owner", resetUrl: "https://suntrix.ai/admin/reset-password/abc" });

/** Make every queued row due now (skip the backoff wait). */
const makeDue = () => EmailLog.updateMany({ status: "queued" }, { $set: { nextAttemptAt: new Date(Date.now() - 1000) } });

describe("email outbox (T-OPA-8)", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120000);

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await clearTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it("queues instead of sending, then delivers and records the provider id", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    const send = vi.fn().mockResolvedValue({ data: { id: "re_123" }, error: null });
    vi.spyOn(resendAdapter, "emails", "get").mockReturnValue({ send });

    await reset();
    expect(send).not.toHaveBeenCalled();
    const queued = await EmailLog.findOne();
    expect(queued).toMatchObject({ status: "queued", template: "passwordResetEmail", to: ["owner@suntrix.test"] });

    expect(await drainEmailOutbox()).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(await EmailLog.findById(queued!._id).lean()).toMatchObject({ status: "sent", providerId: "re_123", attempts: 1 });
  });

  it("retries transient failures with backoff and ends sent", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    const send = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { message: "502 Bad Gateway" } })
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockResolvedValue({ data: { id: "re_ok" }, error: null });
    vi.spyOn(resendAdapter, "emails", "get").mockReturnValue({ send });

    await reset();
    await drainEmailOutbox();
    let row = await EmailLog.findOne().lean();
    expect(row).toMatchObject({ status: "queued", attempts: 1, error: "502 Bad Gateway" });
    expect(row!.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());

    // Not due yet: nothing happens
    expect(await drainEmailOutbox()).toBe(0);

    await makeDue();
    await drainEmailOutbox();
    await makeDue();
    await drainEmailOutbox();
    row = await EmailLog.findOne().lean();
    expect(row).toMatchObject({ status: "sent", attempts: 3, providerId: "re_ok" });
    expect(row!.error).toBeUndefined();
  });

  it(`gives up after ${MAX_EMAIL_ATTEMPTS} attempts`, async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.spyOn(resendAdapter, "emails", "get").mockReturnValue({ send: vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } }) });
    await reset();
    for (let i = 0; i < MAX_EMAIL_ATTEMPTS + 2; i++) {
      await makeDue();
      await drainEmailOutbox();
    }
    expect(await EmailLog.findOne().lean()).toMatchObject({ status: "failed", attempts: MAX_EMAIL_ATTEMPTS });
  });

  it("without a Resend key emails fail as EMAIL_NOT_CONFIGURED and the admin can see it", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    await reset();
    await drainEmailOutbox();
    const row = await EmailLog.findOne().lean();
    expect(row).toMatchObject({ status: "failed", error: "EMAIL_NOT_CONFIGURED" });

    const auth = { Authorization: `Bearer ${await staffToken("admin")}` };
    const stats = await request(app).get("/v1/admin/stats").set(auth);
    expect(stats.body.email).toEqual({ configured: false, failedLast7Days: 1 });

    const log = await request(app).get("/v1/admin/email-log?status=failed").set(auth);
    expect(log.status).toBe(200);
    expect(log.body).toMatchObject({ configured: false, counts: { failed: 1 } });
    expect(log.body.logs[0]).toMatchObject({ template: "passwordResetEmail", error: "EMAIL_NOT_CONFIGURED" });
    expect(log.body.logs[0].html).toBeUndefined();

    // Once configured, the admin can retry it
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.spyOn(resendAdapter, "emails", "get").mockReturnValue({ send: vi.fn().mockResolvedValue({ data: { id: "re_retry" }, error: null }) });
    expect((await request(app).post(`/v1/admin/email-log/${row!._id}/retry`).set(auth)).status).toBe(200);
    await drainEmailOutbox();
    expect(await EmailLog.findById(row!._id).lean()).toMatchObject({ status: "sent", providerId: "re_retry" });
    expect((await request(app).post(`/v1/admin/email-log/${row!._id}/retry`).set(auth)).status).toBe(409);
  });

  it("two drains running at once never send the same email twice", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    const send = vi.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return { data: { id: "x" }, error: null };
    });
    vi.spyOn(resendAdapter, "emails", "get").mockReturnValue({ send });
    for (let i = 0; i < 6; i++) await reset();
    // Simulate a second instance by claiming rows directly while this one drains
    const claimElsewhere = async () => {
      let n = 0;
      while (await EmailLog.findOneAndUpdate({ status: "queued" }, { $set: { status: "sending", lockedUntil: new Date(Date.now() + 60_000) }, $inc: { attempts: 1 } })) n++;
      return n;
    };
    const [mine, theirs] = await Promise.all([drainEmailOutbox(), claimElsewhere()]);
    expect(mine + theirs).toBe(6);
    expect(send).toHaveBeenCalledTimes(mine);
  });
});
