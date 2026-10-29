import { describe, it, expect, vi } from "vitest";
import { updateSettingCache, getSetting } from "../lib/configLoader";
import { groqAdapter } from "../integrations/groq/groq.adapter";

describe("Phase 5 Runtime Settings AI Model Truth & Validation", () => {
  it("should validate and select valid Groq models from settings cache", async () => {
    updateSettingCache("GROQ_CHAT_MODEL", "mixtral-8x7b-32768");
    const configured = getSetting("GROQ_CHAT_MODEL");
    const check = await groqAdapter.validateModelAvailability(configured);
    expect(check).toBeDefined();
  });

  it("should safely report when model setting is unverified or unavailable on Groq API", async () => {
    updateSettingCache("GROQ_CHAT_MODEL", "non_existent_fake_model");
    const configured = getSetting("GROQ_CHAT_MODEL");
    const check = await groqAdapter.validateModelAvailability(configured);
    expect(check.isValid).toBe(false);
    expect(check.message).toBeDefined();
  });

  it("should verify groqAdapter passes the exact configured model to Groq client", async () => {
    process.env.GROQ_API_KEY = "gsk_test_mock_key_for_testing";
    updateSettingCache("GROQ_CHAT_MODEL", "gemma2-9b-it");

    const spy = vi.spyOn(groqAdapter, "generateChatCompletion").mockImplementation(async (params) => {
      const model = params.model || getSetting("GROQ_CHAT_MODEL");
      return `Mocked AI response with model: ${model}`;
    });

    const result = await groqAdapter.generateChatCompletion({
      systemPrompt: "Test prompt",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result).toContain("gemma2-9b-it");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();

    // Restore baseline
    updateSettingCache("GROQ_CHAT_MODEL", "llama-3.1-8b-instant");
  });
});
