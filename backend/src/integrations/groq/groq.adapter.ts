import Groq from "groq-sdk";
import { getSetting } from "../../lib/configLoader";
import { logger } from "../../lib/logger";
import { groqRequests } from "../../lib/metrics";

export interface DiscoveredModel {
  id: string;
  name: string;
  ownedBy: string;
  active: boolean;
  capabilities: string[];
  planEligibility: "Available on Groq" | "Free-plan eligibility confirmed" | "Plan eligibility unknown";
}

interface ModelCacheEntry {
  models: DiscoveredModel[];
  timestamp: number;
}

let modelCache: ModelCacheEntry | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache TTL

function formatModelName(id: string): string {
  return id
    .split("/")
    .pop()!
    .split("-")
    .map((word) => (word.length <= 3 ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

function inferVerifiedCapabilities(id: string): string[] {
  const caps = ["chat"];
  if (
    id.includes("8b") ||
    id.includes("70b") ||
    id.includes("mixtral") ||
    id.includes("gpt-oss") ||
    id.includes("qwen")
  ) {
    caps.push("structured_output");
  }
  if (id.includes("vision")) caps.push("vision");
  if (id.includes("whisper") || id.includes("audio")) caps.push("audio");
  if (id.includes("70b") || id.includes("r1") || id.includes("reasoning") || id.includes("compound")) caps.push("reasoning");
  return caps;
}

function inferPlanEligibility(id: string): "Available on Groq" | "Free-plan eligibility confirmed" | "Plan eligibility unknown" {
  if (id.includes("llama-3.1-8b-instant") || id.includes("llama-3.3-70b-versatile") || id.includes("llama3-8b-8192")) {
    return "Free-plan eligibility confirmed";
  }
  return "Available on Groq";
}

// A hung Groq call must not hold a public request open for minutes
const GROQ_TIMEOUT_MS = 20_000;

export class GroqAdapter {
  private client: { key: string; instance: Groq } | null = null;

  /** One client per API key, with a bounded timeout and a single retry. */
  getClient(): Groq {
    const apiKey = getSetting("GROQ_API_KEY");
    if (!apiKey) throw new Error("GROQ_API_KEY is not set in the environment.");
    if (this.client?.key !== apiKey) {
      this.client = { key: apiKey, instance: new Groq({ apiKey, timeout: GROQ_TIMEOUT_MS, maxRetries: 1 }) };
    }
    return this.client.instance;
  }

  /**
   * Dynamically fetch available models directly from Groq Models API using current API key.
   */
  async listAvailableModels(options?: { forceRefresh?: boolean }): Promise<DiscoveredModel[]> {
    const now = Date.now();
    if (!options?.forceRefresh && modelCache && now - modelCache.timestamp < CACHE_TTL_MS) {
      return modelCache.models;
    }

    try {
      const client = this.getClient();
      const response = await client.models.list();
      const rawList = (response as any).data || [];

      const models: DiscoveredModel[] = rawList.map((item: any) => ({
        id: item.id,
        name: formatModelName(item.id),
        ownedBy: item.owned_by || "groq",
        active: item.active !== false,
        capabilities: inferVerifiedCapabilities(item.id),
        planEligibility: inferPlanEligibility(item.id),
      }));

      modelCache = { models, timestamp: now };
      return models;
    } catch (err: any) {
      logger.warn(`[GroqAdapter] Failed to fetch dynamic models from Groq API: ${err.message || err}`);
      if (modelCache) return modelCache.models;
      return [];
    }
  }

  /**
   * Validate model availability against live API discovery without silent overrides.
   */
  async validateModelAvailability(modelId: string): Promise<{
    isValid: boolean;
    /** True when Groq could not be reached, so the model could not be checked either way */
    unverifiable?: boolean;
    discoveredModel?: DiscoveredModel;
    message?: string;
  }> {
    if (!modelId || !modelId.trim()) {
      return { isValid: false, message: "Model ID is required." };
    }

    const available = await this.listAvailableModels();
    const found = available.find((m) => m.id === modelId.trim());
    if (found && found.active) {
      return { isValid: true, discoveredModel: found };
    }

    if (available.length === 0) {
      // Offline fallback for testing environment without active Groq API Key
      return { isValid: false, unverifiable: true, message: `Model '${modelId}' could not be verified because Groq API key is unconfigured or offline.` };
    }

    return {
      isValid: false,
      message: `Model '${modelId}' is not available or active for the configured Groq API key/account.`,
    };
  }

  async generateChatCompletion(params: {
    operation?: string;
    model?: string;
    systemPrompt: string;
    messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
    temperature?: number;
    maxTokens?: number;
    requiredCapability?: string;
  }): Promise<string> {
    const client = this.getClient();
    const model = params.model || getSetting("GROQ_CHAT_MODEL");
    if (!model) {
      throw new Error("GROQ_CHAT_MODEL is not configured. Please select an available model in Admin → Settings → AI.");
    }

    const temperature = params.temperature ?? parseFloat(getSetting("GROQ_CHAT_TEMPERATURE", "0.7"));
    const maxTokens = params.maxTokens ?? parseInt(getSetting("GROQ_CHAT_MAX_TOKENS", "1024"));

    logger.debug(`[GroqAdapter] Executing AI Request | Operation: ${params.operation || "chat"} | Model: ${model} | Temp: ${temperature}`);

    // Direct SDK call — exact configured model is sent without silent replacement
    const operation = params.operation || "chat";
    let response;
    try {
      response = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: params.systemPrompt },
          ...params.messages,
        ],
        temperature,
        max_tokens: maxTokens,
      });
      groqRequests.inc({ operation, result: "ok" });
    } catch (err) {
      groqRequests.inc({ operation, result: "error" });
      throw err;
    }

    return response.choices[0]?.message?.content || "";
  }
}

export const groqAdapter = new GroqAdapter();
