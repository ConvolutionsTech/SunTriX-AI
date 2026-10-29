import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import app from "../app";
import TaskRequest from "../models/TaskRequest";
import Proposal from "../models/Proposal";
import { groqAdapter } from "../integrations/groq/groq.adapter";
import { connectTestDb, clearTestDb, disconnectTestDb } from "./helpers/db";
import { staffToken } from "./helpers/auth";

let headers: Record<string, string> = {};
const newTask = () => TaskRequest.create({ name: "Ada", email: "ada@client.test", service: "AI", description: "A long enough description." });
const body = (taskRequestId: string, overrides: object = {}) => ({
  taskRequestId,
  title: "Agent build",
  clientEmail: "ada@client.test",
  totalAmount: 500_000,
  milestones: [
    { title: "Discovery", amount: 150_000 },
    { title: "Build", amount: 350_000 },
  ],
  ...overrides,
});

describe("proposal create contract (A1, T-LC-7)", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120000);

  afterEach(async () => {
    vi.restoreAllMocks();
    await clearTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  const admin = async () => (headers = { Authorization: `Bearer ${await staffToken("admin")}` });

  it("creates a proposal in integer cents, orders milestones and starts the review", async () => {
    await admin();
    const task = await newTask();
    const res = await request(app).post("/v1/proposals").set(headers).send(body(String(task._id)));
    expect(res.status).toBe(201);

    const saved = await Proposal.findById(res.body._id).lean();
    expect(saved?.totalAmount).toBe(500_000);
    expect(saved?.currency).toBe("usd");
    expect(saved?.milestones.map((m) => [m.title, m.amount, m.order])).toEqual([["Discovery", 150_000, 0], ["Build", 350_000, 1]]);
    expect((await TaskRequest.findById(task._id))?.status).toBe("in_review");

    const list = await request(app).get(`/v1/proposals/admin/by-task/${task._id}`).set(headers);
    expect(list.body.proposals).toHaveLength(1);
  });

  it("rejects totals that don't match the milestones", async () => {
    await admin();
    const task = await newTask();
    const res = await request(app).post("/v1/proposals").set(headers).send(body(String(task._id), { totalAmount: 400_000 }));
    expect(res.status).toBe(400);
    expect(res.body.details[0].field).toBe("milestones");
  });

  it("rejects fractional (dollar-style) amounts and a missing total", async () => {
    await admin();
    const task = await newTask();
    const dollars = await request(app).post("/v1/proposals").set(headers).send(
      body(String(task._id), { totalAmount: 5000.5, milestones: [{ title: "All", amount: 5000.5 }] })
    );
    expect(dollars.status).toBe(400);

    const { totalAmount: _omit, ...noTotal } = body(String(task._id));
    expect((await request(app).post("/v1/proposals").set(headers).send(noTotal)).status).toBe(400);
  });

  it("AI drafts come back in cents with a matching total", async () => {
    await admin();
    const task = await newTask();
    const draftJson = JSON.stringify({ title: "Draft", milestones: [{ title: "Phase 1", amount: 1500, dueWeek: 2 }, { title: "Phase 2", amount: 2500.5, dueWeek: 6 }] });
    vi.spyOn(groqAdapter, "getClient").mockReturnValue({
      chat: { completions: { create: async () => ({ choices: [{ message: { content: draftJson } }] }) } },
    } as never);

    const res = await request(app).post("/v1/proposals/admin/ai-draft").set(headers).send({ taskRequestId: String(task._id) });
    expect(res.status).toBe(200);
    expect(res.body.draft.milestones.map((m: { amount: number }) => m.amount)).toEqual([150_000, 250_050]);
    expect(res.body.draft.totalAmount).toBe(400_050);
  });
});
