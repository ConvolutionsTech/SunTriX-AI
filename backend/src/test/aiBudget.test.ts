import { describe, it, expect, vi, beforeAll, afterEach, afterAll } from "vitest";
import request from "supertest";
import app from "../app";
import AiUsage from "../models/AiUsage";
import UsageCounter from "../models/UsageCounter";
import { groqAdapter } from "../integrations/groq/groq.adapter";
import { meteredCompletion, tokensUsedToday, consumeChatQuota } from "../lib/aiBudget";
import { updateSettingCache } from "../lib/configLoader";
import { connectTestDb, clearTestDb, disconnectTestDb } from "./helpers/db";
import { staffToken } from "./helpers/auth";

const completion = (tokens: number) => ({ model: "llama-test", usage: { prompt_tokens: tokens - 10, completion_tokens: 10, total_tokens: tokens }, choices: [{ message: { content: "Hi!" } }] });

/** Groq SDK double: every chat completion uses `tokens` tokens. */
function groqReturning(tokens: number) {
  const create = vi.fn().mockResolvedValue(completion(tokens));
  vi.spyOn(groqAdapter, "getClient").mockReturnValue({ chat: { completions: { create } } } as never);
  return create;
}

const chat = (ip = "10.50.0.1") => request(app).post("/v1/chat").set("X-Forwarded-For", ip).send({ messages: [{ role: "user", content: "hello" }] });

describe("AI cost controls (T-OPA-11)", () => {
  beforeAll(async () => {
    await connectTestDb();
    process.env.GROQ_CHAT_MODEL = "llama-test";
  }, 120000);

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const k of ["AI_DAILY_TOKEN_BUDGET", "CHAT_DAILY_PER_IP"]) updateSettingCache(k, "");
    await clearTestDb();
  });

  afterAll(async () => {
    delete process.env.GROQ_CHAT_MODEL;
    await disconnectTestDb();
  });

  it("meters tokens per call and logs usage", async () => {
    groqReturning(120);
    expect((await chat()).status).toBe(200);
    expect(await tokensUsedToday()).toBe(120);
    expect(await AiUsage.findOne().lean()).toMatchObject({ operation: "chat", model: "llama-test", promptTokens: 110, completionTokens: 10, totalTokens: 120, ok: true });
  });

  it("refuses AI once the daily budget is used, for chat and admin drafting alike", async () => {
    updateSettingCache("AI_DAILY_TOKEN_BUDGET", "200");
    const create = groqReturning(150);
    expect((await chat()).status).toBe(200);
    expect((await chat("10.50.0.2")).status).toBe(200); // 300 ≥ 200 now
    const blocked = await chat("10.50.0.3");
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe("AI_BUDGET_EXCEEDED");
    expect(create).toHaveBeenCalledTimes(2);

    await expect(meteredCompletion("contract", async () => completion(1))).rejects.toMatchObject({ code: "AI_BUDGET_EXCEEDED" });
  });

  it("caps chat messages per visitor per day", async () => {
    updateSettingCache("CHAT_DAILY_PER_IP", "2");
    groqReturning(5);
    expect((await chat("10.60.0.1")).status).toBe(200);
    expect((await chat("10.60.0.1")).status).toBe(200);
    const third = await chat("10.60.0.1");
    expect(third.status).toBe(429);
    expect(third.body.code).toBe("CHAT_DAILY_LIMIT");
    expect((await chat("10.60.0.2")).status).toBe(200);
  });

  it("parallel increments stay exact", async () => {
    await Promise.all(Array.from({ length: 25 }, () => consumeChatQuota("10.70.0.1").catch(() => undefined)));
    const day = new Date().toISOString().slice(0, 10);
    expect((await UsageCounter.findById(`chat:${day}:10.70.0.1`).lean())?.n).toBe(25);

    await Promise.all(Array.from({ length: 20 }, () => meteredCompletion("x", async () => completion(7))));
    expect(await tokensUsedToday()).toBe(140);
  });

  it("a failed call is logged and not counted", async () => {
    await expect(meteredCompletion("contract", async () => { throw new Error("groq down"); })).rejects.toThrow("groq down");
    expect(await AiUsage.findOne().lean()).toMatchObject({ operation: "contract", ok: false, error: "groq down" });
    expect(await tokensUsedToday()).toBe(0);
  });

  it("admins see usage per day", async () => {
    groqReturning(50);
    await chat();
    const res = await request(app).get("/v1/admin/ai-usage?days=7").set("Authorization", `Bearer ${await staffToken("viewer")}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ budget: 500000, usedToday: 50 });
    expect(res.body.days).toEqual([{ day: new Date().toISOString().slice(0, 10), operation: "chat", calls: 1, failed: 0, tokens: 50 }]);
  });
});
