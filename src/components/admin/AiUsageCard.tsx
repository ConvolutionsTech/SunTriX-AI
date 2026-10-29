import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { apiRequest, ENDPOINTS } from "@/lib/api";

interface AiUsage {
  budget: number;
  usedToday: number;
  days: { day: string; operation: string; calls: number; failed: number; tokens: number }[];
}

/** Today's AI token use against the daily budget, plus the 7-day total. */
export function AiUsageCard() {
  const [usage, setUsage] = useState<AiUsage | null>(null);

  useEffect(() => {
    apiRequest<AiUsage>(ENDPOINTS.ADMIN_AI_USAGE(7)).then(({ data }) => setUsage(data ?? null));
  }, []);

  if (!usage) return null;
  const weekTokens = usage.days.reduce((sum, d) => sum + d.tokens, 0);
  const weekCalls = usage.days.reduce((sum, d) => sum + d.calls, 0);
  const pct = usage.budget > 0 ? Math.min(100, Math.round((usage.usedToday / usage.budget) * 100)) : 0;

  return (
    <div className="rounded-xl border border-border/60 bg-background p-4 text-sm" aria-label="AI usage">
      <div className="mb-2 flex items-center gap-2 font-semibold">
        <Sparkles className="h-4 w-4 text-primary" /> AI usage
      </div>
      <p>
        Today: <strong>{usage.usedToday.toLocaleString()}</strong>
        {usage.budget > 0 ? ` of ${usage.budget.toLocaleString()} tokens (${pct}%)` : " tokens (no daily limit)"}
      </p>
      {usage.budget > 0 && (
        <div className="mt-2 h-1.5 w-full rounded bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className={`h-1.5 rounded ${pct >= 90 ? "bg-rose-500" : "bg-primary"}`} style={{ width: `${pct}%` }} />
        </div>
      )}
      <p className="mt-2 text-muted-foreground">
        Last 7 days: {weekTokens.toLocaleString()} tokens across {weekCalls.toLocaleString()} calls
      </p>
    </div>
  );
}
