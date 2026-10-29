import AiUsage from "../models/AiUsage";
import UsageCounter from "../models/UsageCounter";
import { AppError } from "../shared/errors/appError";
import { getSetting } from "./configLoader";
import { groqRequests } from "./metrics";
import { logger } from "./logger";

/**
 * AI cost controls. Every Groq call is metered into a DB-backed daily token
 * counter (shared by all instances, survives restarts); once it reaches
 * AI_DAILY_TOKEN_BUDGET, AI calls are refused until midnight UTC. The public
 * chat also has a per-IP daily message cap.
 */
const day = (now = new Date()) => now.toISOString().slice(0, 10);
const endOfDayPlus = (now: Date, extraDays: number) => {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1 + extraDays));
  return d;
};
const limit = (key: string, fallback: number) => {
  const n = parseInt(getSetting(key, String(fallback)));
  return Number.isFinite(n) ? n : fallback;
};

async function increment(id: string, by: number, now: Date): Promise<number> {
  const doc = await UsageCounter.findOneAndUpdate(
    { _id: id },
    { $inc: { n: by }, $setOnInsert: { expiresAt: endOfDayPlus(now, 2) } },
    { upsert: true, new: true }
  ).lean();
  return doc!.n;
}

export async function tokensUsedToday(now = new Date()): Promise<number> {
  return (await UsageCounter.findById(`ai-tokens:${day(now)}`).lean())?.n ?? 0;
}

/** Throws 429 AI_BUDGET_EXCEEDED once today's tokens reach the budget (0 = unlimited). */
export async function assertAiBudget(now = new Date()): Promise<void> {
  const budget = limit("AI_DAILY_TOKEN_BUDGET", 500_000);
  if (budget > 0 && (await tokensUsedToday(now)) >= budget) {
    throw new AppError("The daily AI budget is used up. AI features resume at midnight UTC.", 429, "AI_BUDGET_EXCEEDED");
  }
}

/** Counts one public chat message for this IP; throws 429 CHAT_DAILY_LIMIT past the cap (0 = unlimited). */
export async function consumeChatQuota(ip: string, now = new Date()): Promise<void> {
  const cap = limit("CHAT_DAILY_PER_IP", 60);
  if (cap <= 0) return;
  const used = await increment(`chat:${day(now)}:${ip}`, 1, now);
  if (used > cap) throw new AppError("You've reached today's chat limit. Please contact us directly or try again tomorrow.", 429, "CHAT_DAILY_LIMIT");
}

interface CompletionLike {
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
}

/** Run one Groq call under the budget and record its token use, latency and outcome. */
export async function meteredCompletion<T extends CompletionLike>(operation: string, call: () => Promise<T>, model?: string): Promise<T> {
  await assertAiBudget();
  const started = Date.now();
  try {
    const result = await call();
    const usage = result.usage ?? {};
    const total = usage.total_tokens ?? (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0);
    groqRequests.inc({ operation, result: "ok" });
    await Promise.all([
      total > 0 ? increment(`ai-tokens:${day()}`, total, new Date()) : Promise.resolve(0),
      AiUsage.create({
        operation, model: result.model ?? model, ok: true, latencyMs: Date.now() - started,
        promptTokens: usage.prompt_tokens ?? 0, completionTokens: usage.completion_tokens ?? 0, totalTokens: total,
      }),
    ]).catch((err) => logger.error({ err, operation }, "Could not record AI usage"));
    return result;
  } catch (err) {
    groqRequests.inc({ operation, result: "error" });
    await AiUsage.create({ operation, model, ok: false, latencyMs: Date.now() - started, error: (err as Error).message?.slice(0, 300) })
      .catch(() => undefined);
    throw err;
  }
}

/** Per-day totals for the admin dashboard. */
export async function aiUsageSummary(days: number, now = new Date()) {
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const rows = await AiUsage.aggregate<{ _id: { day: string; operation: string }; calls: number; failed: number; tokens: number }>([
    { $match: { createdAt: { $gte: since } } },
    {
      $group: {
        _id: { day: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, operation: "$operation" },
        calls: { $sum: 1 },
        failed: { $sum: { $cond: ["$ok", 0, 1] } },
        tokens: { $sum: "$totalTokens" },
      },
    },
    { $sort: { "_id.day": 1, "_id.operation": 1 } },
  ]);
  return {
    budget: limit("AI_DAILY_TOKEN_BUDGET", 500_000),
    usedToday: await tokensUsedToday(now),
    days: rows.map((r) => ({ day: r._id.day, operation: r._id.operation, calls: r.calls, failed: r.failed, tokens: r.tokens })),
  };
}
