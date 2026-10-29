import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import app from "../app";
import { groqAdapter } from "../integrations/groq/groq.adapter";
import { updateSettingCache } from "../lib/configLoader";
import { connectTestDb, disconnectTestDb } from "./helpers/db";
import { staffToken } from "./helpers/auth";

const say = (content: string) => request(app).post("/v1/chat").send({ messages: [{ role: "user", content }] });

afterEach(() => {
  vi.restoreAllMocks();
  for (const key of ["CHATBOT_ENABLED", "AI_ENABLED", "BRAND_NAME", "CHATBOT_SYSTEM_PROMPT"]) updateSettingCache(key, "");
});

describe("public chatbot (M1, M43)", () => {
  it("is off when the admin disables the chatbot or AI", async () => {
    const groq = vi.spyOn(groqAdapter, "generateChatCompletion");

    updateSettingCache("CHATBOT_ENABLED", "false");
    expect((await say("hi")).status).toBe(503);

    updateSettingCache("CHATBOT_ENABLED", "true");
    updateSettingCache("AI_ENABLED", "false");
    const res = await say("hi");
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("CHAT_DISABLED");
    expect(groq).not.toHaveBeenCalled();
  });

  it("builds the system prompt from brand settings unless a custom prompt is set", async () => {
    const groq = vi.spyOn(groqAdapter, "generateChatCompletion").mockResolvedValue("Hello!");
    updateSettingCache("BRAND_NAME", "Acme Robotics");

    const res = await say("who are you?");
    expect(res.status).toBe(200);
    expect(res.body.choices[0].message.content).toBe("Hello!");
    expect(groq.mock.calls[0][0].systemPrompt).toContain("Acme Robotics");

    updateSettingCache("CHATBOT_SYSTEM_PROMPT", "Only answer in haiku.");
    await say("again");
    expect(groq.mock.calls[1][0].systemPrompt).toBe("Only answer in haiku.");
  });

  it("returns a friendly fallback when Groq fails or times out", async () => {
    vi.spyOn(groqAdapter, "generateChatCompletion").mockRejectedValue(Object.assign(new Error("Request timed out."), { name: "APIConnectionTimeoutError" }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await say("hi");
    expect(res.status).toBe(200);
    expect(res.body.choices[0].message.content).toMatch(/unavailable/i);
  });

  it("uses one Groq client per key with a bounded timeout", () => {
    process.env.GROQ_API_KEY = "gsk_test_one";
    const a = groqAdapter.getClient();
    expect(groqAdapter.getClient()).toBe(a);
    expect((a as unknown as { timeout: number; maxRetries: number }).timeout).toBe(20_000);
    expect((a as unknown as { maxRetries: number }).maxRetries).toBe(1);
    process.env.GROQ_API_KEY = "gsk_test_two";
    expect(groqAdapter.getClient()).not.toBe(a);
    delete process.env.GROQ_API_KEY;
  });
});

describe("AI extraction input cap", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120000);

  afterAll(async () => {
    await disconnectTestDb();
  });

  it("rejects text over 20,000 characters before calling Groq", async () => {
    const groq = vi.spyOn(groqAdapter, "getClient");
    const res = await request(app)
      .post("/v1/ai/extract")
      .set("Authorization", `Bearer ${await staffToken("admin")}`)
      .send({ module: "portfolio", text: "x".repeat(25_000) });
    expect(res.status).toBe(400);
    expect(groq).not.toHaveBeenCalled();
  });
});
