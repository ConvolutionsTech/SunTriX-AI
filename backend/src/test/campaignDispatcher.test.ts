import { describe, it, expect, vi, beforeAll, afterEach, afterAll } from "vitest";
import request from "supertest";
import app from "../app";
import Campaign from "../models/Campaign";
import CampaignRecipient from "../models/CampaignRecipient";
import Newsletter from "../models/Newsletter";
import * as email from "../services/email";
import { resendAdapter } from "../integrations/resend/resend.adapter";
import { dispatchCampaigns, createCampaignDispatcher, queueCampaignRecipients } from "../jobs/campaignDispatcher";
import { updateSettingCache } from "../lib/configLoader";
import { connectTestDb, clearTestDb, disconnectTestDb } from "./helpers/db";
import { staffToken } from "./helpers/auth";

const people = (n: number) => Array.from({ length: n }, (_, i) => ({ email: `r${i + 1}@reader.test`, unsubscribeUrl: `https://x/u/${i + 1}` }));

async function campaignWith(n: number) {
  const campaign = await Campaign.create({ subject: "S", htmlBody: "<p>x</p>", targetAudience: "All", recipientCount: n, adminId: "a", adminName: "A", status: "queued" });
  await queueCampaignRecipients(campaign._id, people(n));
  return campaign;
}

/** Resend double that records every address and fails the given batch numbers (1-based). */
function resend(failBatches: number[] = []) {
  const delivered: string[] = [];
  let call = 0;
  const send = vi.fn(async (batch: Array<{ to: string[] }>) => {
    call++;
    if (failBatches.includes(call)) return { data: null, error: { message: `batch ${call} rejected` } };
    delivered.push(...batch.map((m) => m.to[0]));
    return { data: { data: [] }, error: null };
  });
  vi.spyOn(resendAdapter, "batch", "get").mockReturnValue({ send });
  return { delivered, send };
}

describe("durable campaign dispatcher (T-OPA-7)", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120000);

  afterEach(async () => {
    vi.restoreAllMocks();
    updateSettingCache("NEWSLETTER_BATCH_SIZE", "");
    await clearTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it("records each recipient; a failed batch leaves the campaign partially failed; retry re-sends exactly those", async () => {
    updateSettingCache("NEWSLETTER_BATCH_SIZE", "2");
    vi.spyOn(email, "sendCampaignFailureNotification").mockResolvedValue();
    const { delivered } = resend([2]);
    const campaign = await campaignWith(6);

    await dispatchCampaigns();
    expect(delivered).toEqual(["r1@reader.test", "r2@reader.test", "r5@reader.test", "r6@reader.test"]);
    const after = await Campaign.findById(campaign._id).lean();
    expect(after).toMatchObject({ status: "partially_failed", sentCount: 4, failedCount: 2, errorMessage: "batch 2 rejected" });
    expect(after!.lockedUntil).toBeUndefined();
    expect(await CampaignRecipient.find({ campaignId: campaign._id, status: "failed" }).distinct("email")).toEqual(["r3@reader.test", "r4@reader.test"]);
    expect(email.sendCampaignFailureNotification).toHaveBeenCalledOnce();

    vi.restoreAllMocks();
    const retry = resend();
    const res = await request(app).post(`/v1/newsletter/admin/campaigns/${campaign._id}/retry`).set("Authorization", `Bearer ${await staffToken("admin")}`);
    expect(res.status).toBe(200);
    await vi.waitFor(async () => expect((await Campaign.findById(campaign._id))?.status).toBe("sent"));
    expect(retry.delivered).toEqual(["r3@reader.test", "r4@reader.test"]);
    expect((await Campaign.findById(campaign._id))?.sentCount).toBe(6);
  });

  it("a campaign left mid-send by a dead worker is finished after its lease expires, without re-sending", async () => {
    const campaign = await campaignWith(3);
    // Worker crashed after sending r1 and before finishing
    await CampaignRecipient.updateOne({ campaignId: campaign._id, email: "r1@reader.test" }, { $set: { status: "sent" } });
    await Campaign.updateOne({ _id: campaign._id }, { $set: { status: "sending", workerId: "dead", lockedUntil: new Date(Date.now() + 60_000) } });

    const { delivered } = resend();
    await dispatchCampaigns();
    expect(delivered).toEqual([]); // lease still held

    await Campaign.updateOne({ _id: campaign._id }, { $set: { lockedUntil: new Date(Date.now() - 1000) } });
    await dispatchCampaigns();
    expect(delivered).toEqual(["r2@reader.test", "r3@reader.test"]);
    expect(await Campaign.findById(campaign._id).lean()).toMatchObject({ status: "sent", sentCount: 3 });
  });

  it("two dispatchers in parallel never double-send", async () => {
    updateSettingCache("NEWSLETTER_BATCH_SIZE", "1");
    const { delivered } = resend();
    await campaignWith(4);
    await campaignWith(4).then((c) => CampaignRecipient.updateMany({ campaignId: c._id }, [{ $set: { email: { $concat: ["b-", "$email"] } } }]));

    // A second instance has its own worker id and in-process guard
    const other = createCampaignDispatcher("other-instance");
    await Promise.all([dispatchCampaigns(), other()]);
    expect(delivered).toHaveLength(8);
    expect(new Set(delivered).size).toBe(8);
  });

  it("the broadcast endpoint snapshots recipients and returns before sending", async () => {
    const { delivered } = resend();
    for (const n of [1, 2]) await Newsletter.create({ name: `R${n}`, email: `r${n}@reader.test`, interest: "AI", subscribed: true });
    const res = await request(app).post("/v1/newsletter/broadcast").set("Authorization", `Bearer ${await staffToken("admin")}`).send({ subject: "Hi", body: "<p>News</p>", targetAudience: "All" });
    expect(res.status).toBe(202);
    expect(await CampaignRecipient.countDocuments({ campaignId: res.body.campaignId })).toBe(2);
    await vi.waitFor(async () => expect((await Campaign.findById(res.body.campaignId))?.status).toBe("sent"));
    expect(delivered.sort()).toEqual(["r1@reader.test", "r2@reader.test"]);
  });
});
