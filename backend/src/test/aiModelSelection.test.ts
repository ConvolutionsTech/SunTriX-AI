import { describe, it, expect, vi, beforeAll, afterEach, afterAll } from "vitest";
import { groqAdapter } from "../integrations/groq/groq.adapter";
import { sendChat, generateContractWithAI, extractFields } from "../services/groq";
import { updateSettingCache } from "../lib/configLoader";
import { connectTestDb, clearTestDb, disconnectTestDb } from "./helpers/db";

/** Groq SDK double that records the request each AI feature actually sends. */
function captureGroq(content = "ok") {
  const create = vi.fn().mockResolvedValue({ model: "x", usage: { total_tokens: 5 }, choices: [{ message: { content } }] });
  vi.spyOn(groqAdapter, "getClient").mockReturnValue({ chat: { completions: { create } } } as never);
  return create;
}

describe("AI features use the configured models (replaces the set-then-get suites, T-OPB-20)", () => {
  beforeAll(async () => {
    await connectTestDb(); // AI calls are metered in MongoDB
  }, 120000);

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const k of ["GROQ_CHAT_MODEL", "GROQ_EXTRACT_MODEL", "AI_ENABLED"]) updateSettingCache(k, "");
    await clearTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it("chat and contract drafting send GROQ_CHAT_MODEL; extraction sends GROQ_EXTRACT_MODEL", async () => {
    updateSettingCache("GROQ_CHAT_MODEL", "chat-model-a");
    updateSettingCache("GROQ_EXTRACT_MODEL", "extract-model-b");
    const create = captureGroq('{"title":"X"}');

    await sendChat([{ role: "user", content: "Hello" }]);
    await generateContractWithAI({
      brandName: "B", clientName: "Ada", clientEmail: "ada@client.test", projectTitle: "P", scopeItems: [], timeline: "4 weeks",
      milestones: [], totalAmount: "$1.00", terms: "50/50", techStack: "",
    });
    await extractFields("portfolio", "A project about computer vision");

    expect(create.mock.calls.map(([params]) => params.model)).toEqual(["chat-model-a", "chat-model-a", "extract-model-b"]);
  });

  it("changing the model in settings takes effect on the next call, with no fallback to another model", async () => {
    const create = captureGroq();
    updateSettingCache("GROQ_CHAT_MODEL", "first-model");
    await sendChat([{ role: "user", content: "1" }]);
    updateSettingCache("GROQ_CHAT_MODEL", "second-model");
    await sendChat([{ role: "user", content: "2" }]);
    expect(create.mock.calls.map(([p]) => p.model)).toEqual(["first-model", "second-model"]);
  });

  it("AI switched off means no call reaches Groq", async () => {
    const create = captureGroq();
    updateSettingCache("AI_ENABLED", "false");
    expect(await sendChat([{ role: "user", content: "hi" }])).toMatch(/disabled/i);
    expect(create).not.toHaveBeenCalled();
  });
});
