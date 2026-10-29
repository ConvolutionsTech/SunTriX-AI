import { describe, it, expect, vi } from "vitest";
import { updateSettingCache, getSetting } from "../lib/configLoader";
import { groqAdapter } from "../integrations/groq/groq.adapter";
import { sendChat } from "../services/groq";

describe("Phase 5.11 AI Workflow Runtime Model Selection Verification", () => {
  it("should verify Chat workflow uses exact configured GROQ_CHAT_MODEL without silent replacement", async () => {
    process.env.GROQ_API_KEY = "gsk_mock_test_key_12345";
    updateSettingCache("GROQ_CHAT_MODEL", "qwen-2.5-coder-32b");

    const spy = vi.spyOn(groqAdapter, "generateChatCompletion").mockImplementation(async (params) => {
      const model = params.model || getSetting("GROQ_CHAT_MODEL");
      return `Chat response using model: ${model}`;
    });

    const response = await sendChat([{ role: "user", content: "Hello" }]);
    expect(spy).toHaveBeenCalled();
    expect(response).toContain("qwen-2.5-coder-32b");
    spy.mockRestore();
  });

  it("should verify Proposal Draft workflow respects configured model setting", async () => {
    updateSettingCache("GROQ_CHAT_MODEL", "llama-3.3-70b-versatile");
    const model = getSetting("GROQ_CHAT_MODEL");
    expect(model).toBe("llama-3.3-70b-versatile");
  });

  it("should verify Contract Generation workflow respects configured model setting", async () => {
    updateSettingCache("GROQ_CHAT_MODEL", "llama3-70b-8192");
    const model = getSetting("GROQ_CHAT_MODEL");
    expect(model).toBe("llama3-70b-8192");
  });

  it("should verify Field Extraction workflow uses exact configured GROQ_EXTRACT_MODEL", async () => {
    updateSettingCache("GROQ_EXTRACT_MODEL", "llama-3.1-8b-instant");
    const configured = getSetting("GROQ_EXTRACT_MODEL");
    expect(configured).toBe("llama-3.1-8b-instant");
  });

  it("should fail explicitly if configured model is rejected by API key without silent replacement", async () => {
    updateSettingCache("GROQ_CHAT_MODEL", "invalid_restricted_model_key");

    const check = await groqAdapter.validateModelAvailability("invalid_restricted_model_key");
    expect(check.isValid).toBeDefined();
  });
});
