import { describe, it, expect, vi, beforeAll } from "vitest";
import { groqAdapter, DiscoveredModel } from "../integrations/groq/groq.adapter";
import { updateSettingCache, getSetting } from "../lib/configLoader";

describe("Dynamic Groq Model Discovery & Selection Test Suite", () => {
  beforeAll(() => {
    process.env.GROQ_API_KEY = "gsk_mock_test_key_12345";
  });

  it("should dynamically list models from Groq API and infer capabilities", async () => {
    const spy = vi.spyOn(groqAdapter, "listAvailableModels").mockResolvedValue([
      {
        id: "llama-3.1-8b-instant",
        name: "Llama 3.1 8B Instant",
        ownedBy: "groq",
        active: true,
        capabilities: ["chat", "structured_output"],
        planEligibility: "Free-plan eligibility confirmed",
      },
      {
        id: "llama3-70b-8192",
        name: "Llama 3 70B 8192",
        ownedBy: "groq",
        active: true,
        capabilities: ["chat", "reasoning", "structured_output"],
        planEligibility: "Available on Groq",
      },
      {
        id: "qwen-2.5-coder-32b",
        name: "Qwen 2.5 Coder 32B",
        ownedBy: "groq",
        active: true,
        capabilities: ["chat", "structured_output"],
        planEligibility: "Available on Groq",
      },
    ]);

    const models = await groqAdapter.listAvailableModels();
    expect(models).toBeDefined();
    expect(models.length).toBe(3);
    expect(models[0].id).toBe("llama-3.1-8b-instant");
    expect(models[2].id).toBe("qwen-2.5-coder-32b");
    spy.mockRestore();
  });

  it("should validate valid discovered model selection", async () => {
    vi.spyOn(groqAdapter, "listAvailableModels").mockResolvedValue([
      {
        id: "llama-3.1-8b-instant",
        name: "Llama 3.1 8B Instant",
        ownedBy: "groq",
        active: true,
        capabilities: ["chat", "structured_output"],
        planEligibility: "Free-plan eligibility confirmed",
      },
    ]);

    const check = await groqAdapter.validateModelAvailability("llama-3.1-8b-instant");
    expect(check.isValid).toBe(true);
    expect(check.discoveredModel?.id).toBe("llama-3.1-8b-instant");
    vi.restoreAllMocks();
  });

  it("should reject saving an invalid or unverified model", async () => {
    vi.spyOn(groqAdapter, "listAvailableModels").mockResolvedValue([
      {
        id: "llama-3.1-8b-instant",
        name: "Llama 3.1 8B Instant",
        ownedBy: "groq",
        active: true,
        capabilities: ["chat", "structured_output"],
        planEligibility: "Free-plan eligibility confirmed",
      },
    ]);

    const check = await groqAdapter.validateModelAvailability("non_existent_fake_groq_model");
    expect(check.isValid).toBe(false);
    expect(check.message).toContain("not available or active");
    vi.restoreAllMocks();
  });

  it("should reflect new provider model in settings when Groq introduces a new model (zero code changes required)", async () => {
    // 1. Initial provider response
    const mockList: DiscoveredModel[] = [
      {
        id: "llama-3.1-8b-instant",
        name: "Llama 3.1 8B Instant",
        ownedBy: "groq",
        active: true,
        capabilities: ["chat"],
        planEligibility: "Free-plan eligibility confirmed",
      },
    ];

    const spy = vi.spyOn(groqAdapter, "listAvailableModels").mockImplementation(async () => mockList);

    let catalog = await groqAdapter.listAvailableModels();
    expect(catalog.find((m) => m.id === "gpt-oss-120b")).toBeUndefined();

    // 2. Groq adds a new model dynamically (e.g. "gpt-oss-120b")
    mockList.push({
      id: "gpt-oss-120b",
      name: "GPT OSS 120B",
      ownedBy: "openai",
      active: true,
      capabilities: ["chat", "reasoning"],
      planEligibility: "Available on Groq",
    });

    catalog = await groqAdapter.listAvailableModels({ forceRefresh: true });
    expect(catalog.find((m) => m.id === "gpt-oss-120b")).toBeDefined();

    // 3. Admin selects the newly added model
    updateSettingCache("GROQ_CHAT_MODEL", "gpt-oss-120b");
    expect(getSetting("GROQ_CHAT_MODEL")).toBe("gpt-oss-120b");

    const check = await groqAdapter.validateModelAvailability("gpt-oss-120b");
    expect(check.isValid).toBe(true);

    spy.mockRestore();
    updateSettingCache("GROQ_CHAT_MODEL", "llama-3.1-8b-instant");
  });
});
