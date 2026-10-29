import { describe, it, expect, beforeAll, afterAll } from "vitest";
import ProjectTracker from "../models/ProjectTracker";
import Contract from "../models/Contract";
import { connectTestDb, disconnectTestDb } from "./helpers/db";

describe("schema drift guard (T-OPB-18)", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120000);

  afterAll(async () => {
    await disconnectTestDb();
  });

  it("outside production, writing an undeclared field throws instead of being dropped", async () => {
    await expect(
      ProjectTracker.create({ taskRequestId: "64b0000000000000000000a1", proposalId: "64b0000000000000000000a2", trackerToken: "trk_drift", bogus: 1 } as never)
    ).rejects.toThrow(/not in schema/);
  });

  it("contracts keep the accepted total", async () => {
    const c = await Contract.create({
      contractToken: "contract_drift", taskRequestId: "64b0000000000000000000a1", proposalId: "64b0000000000000000000a2",
      clientEmail: "ada@client.test", fullContractText: "t", totalAmount: 500_000, currency: "usd", expiresAt: new Date(Date.now() + 86_400_000),
    });
    expect((await Contract.findById(c._id).lean())?.totalAmount).toBe(500_000);
  });
});
