import { useCallback, useEffect, useState } from "react";
import { Plus, Send, Sparkles, Trash2 } from "lucide-react";
import { apiRequest, ENDPOINTS } from "@/lib/api";
import { formatCents, toCents } from "@/lib/money";
import { useToast } from "@/hooks/use-toast";
import { AdminStatusBadge } from "./AdminStatusBadge";

interface Milestone {
  title: string;
  amount: number; // cents
  dueWeek?: number;
}

export interface ProposalSummary {
  _id: string;
  title: string;
  status: string;
  totalAmount: number; // cents
  currency: string;
  expiresAt: string;
  executiveSummary?: string;
  scopeOfWork?: string;
  deliverables?: string;
  timeline?: string;
  paymentTerms?: string;
  clientNote?: string;
  milestones: Milestone[];
}

interface Draft {
  title: string;
  executiveSummary: string;
  scopeOfWork: string;
  deliverables: string;
  timeline: string;
  paymentTerms: string;
  expiresInDays: number;
  milestones: { title: string; dollars: string; dueWeek: number }[];
}

const emptyDraft = (): Draft => ({
  title: "",
  executiveSummary: "",
  scopeOfWork: "",
  deliverables: "",
  timeline: "",
  paymentTerms: "",
  expiresInDays: 14,
  milestones: [{ title: "", dollars: "", dueWeek: 1 }],
});

/** Proposal amounts arrive in cents; the form edits dollars. */
function draftFrom(p: Partial<ProposalSummary>): Draft {
  return {
    ...emptyDraft(),
    title: p.title || "",
    executiveSummary: p.executiveSummary || "",
    scopeOfWork: p.scopeOfWork || "",
    deliverables: p.deliverables || "",
    timeline: p.timeline || "",
    paymentTerms: p.paymentTerms || "",
    milestones: (p.milestones?.length ? p.milestones : [{ title: "", amount: 0 }]).map((m, i) => ({
      title: m.title,
      dollars: m.amount ? String(m.amount / 100) : "",
      dueWeek: m.dueWeek || i + 1,
    })),
  };
}

const SENDABLE = ["draft", "changes_requested", "expired"];
const inputClass = "w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary";

/**
 * Proposal workflow for one request: draft (manually or with AI) → save →
 * send to client. A revision after "changes requested" is a new proposal that
 * replaces the previous one when sent.
 */
export const ProposalEditor = ({ taskId, clientEmail, clientName, onChanged }: {
  taskId: string;
  clientEmail: string;
  clientName: string;
  onChanged: () => void;
}) => {
  const { toast } = useToast();
  const [proposals, setProposals] = useState<ProposalSummary[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<"" | "ai" | "save" | "send">("");

  const load = useCallback(async () => {
    const { data } = await apiRequest<{ proposals: ProposalSummary[] }>(ENDPOINTS.PROPOSAL_ADMIN_BY_TASK(taskId));
    setProposals(data?.proposals ?? []);
  }, [taskId]);

  useEffect(() => {
    load();
  }, [load]);

  const latest = proposals[0];
  const totalCents = draft ? draft.milestones.reduce((sum, m) => sum + toCents(m.dollars), 0) : 0;
  const fail = (title: string, description?: string | null) => toast({ title, description: description || undefined, variant: "destructive" });

  const draftWithAI = async () => {
    setBusy("ai");
    const { data, error } = await apiRequest<{ draft: Partial<ProposalSummary> }>(ENDPOINTS.PROPOSAL_ADMIN_AI_DRAFT, {
      method: "POST",
      body: { taskRequestId: taskId },
    });
    setBusy("");
    if (error || !data) return fail("AI draft failed", error);
    setDraft(draftFrom(data.draft));
  };

  const save = async () => {
    if (!draft) return;
    setBusy("save");
    const milestones = draft.milestones.map((m) => ({ title: m.title, amount: toCents(m.dollars), dueWeek: m.dueWeek }));
    const { error } = await apiRequest(ENDPOINTS.PROPOSAL_ADMIN_CREATE, {
      method: "POST",
      body: {
        taskRequestId: taskId,
        clientEmail,
        clientName,
        title: draft.title,
        executiveSummary: draft.executiveSummary,
        scopeOfWork: draft.scopeOfWork,
        deliverables: draft.deliverables,
        timeline: draft.timeline,
        paymentTerms: draft.paymentTerms,
        expiresInDays: draft.expiresInDays,
        milestones,
        totalAmount: milestones.reduce((sum, m) => sum + m.amount, 0),
        currency: "usd",
      },
    });
    setBusy("");
    if (error) return fail("Could not save the proposal", error);
    setDraft(null);
    toast({ title: "Proposal saved as draft" });
    await load();
    onChanged();
  };

  const send = async (p: ProposalSummary) => {
    if (!window.confirm(`Email "${p.title}" (${formatCents(p.totalAmount, p.currency)}) to ${clientEmail}?`)) return;
    setBusy("send");
    const { error } = await apiRequest(ENDPOINTS.PROPOSAL_ADMIN_SEND(p._id), { method: "POST" });
    setBusy("");
    if (error) return fail("Could not send the proposal", error);
    toast({ title: "Proposal sent", description: `${clientEmail} has the link.` });
    await load();
    onChanged();
  };

  const setMilestone = (i: number, patch: Partial<Draft["milestones"][number]>) =>
    setDraft((d) => d && { ...d, milestones: d.milestones.map((m, idx) => (idx === i ? { ...m, ...patch } : m)) });

  if (draft) {
    return (
      <div className="space-y-4 text-xs">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Proposal draft</h3>
          <button onClick={draftWithAI} disabled={busy !== ""} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 font-medium hover:bg-muted disabled:opacity-60">
            <Sparkles className="h-3.5 w-3.5" /> {busy === "ai" ? "Drafting…" : "Fill with AI"}
          </button>
        </div>

        <label className="block space-y-1">
          <span className="font-medium">Title</span>
          <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className={inputClass} />
        </label>
        {(["executiveSummary", "scopeOfWork", "deliverables", "timeline", "paymentTerms"] as const).map((field) => (
          <label key={field} className="block space-y-1">
            <span className="font-medium">{field.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}</span>
            <textarea rows={3} value={draft[field]} onChange={(e) => setDraft({ ...draft, [field]: e.target.value })} className={inputClass} />
          </label>
        ))}

        <div className="space-y-2">
          <span className="font-medium">Milestones (USD)</span>
          {draft.milestones.map((m, i) => (
            <div key={i} className="grid grid-cols-[1fr_7rem_5rem_2rem] gap-2 items-center">
              <input aria-label={`Milestone ${i + 1} title`} placeholder="Title" value={m.title} onChange={(e) => setMilestone(i, { title: e.target.value })} className={inputClass} />
              <input aria-label={`Milestone ${i + 1} amount in dollars`} placeholder="$" inputMode="decimal" value={m.dollars} onChange={(e) => setMilestone(i, { dollars: e.target.value })} className={inputClass} />
              <input aria-label={`Milestone ${i + 1} due week`} type="number" min={0} value={m.dueWeek} onChange={(e) => setMilestone(i, { dueWeek: Number(e.target.value) })} className={inputClass} />
              <button aria-label={`Remove milestone ${i + 1}`} disabled={draft.milestones.length === 1} onClick={() => setDraft({ ...draft, milestones: draft.milestones.filter((_, idx) => idx !== i) })} className="p-1 text-muted-foreground hover:text-destructive disabled:opacity-30">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <button onClick={() => setDraft({ ...draft, milestones: [...draft.milestones, { title: "", dollars: "", dueWeek: draft.milestones.length + 1 }] })} className="inline-flex items-center gap-1 text-primary hover:underline">
            <Plus className="h-3.5 w-3.5" /> Add milestone
          </button>
          <p className="font-mono text-muted-foreground">Total: {formatCents(totalCents)}</p>
        </div>

        <label className="block space-y-1 max-w-[10rem]">
          <span className="font-medium">Valid for (days)</span>
          <input type="number" min={1} max={90} value={draft.expiresInDays} onChange={(e) => setDraft({ ...draft, expiresInDays: Number(e.target.value) })} className={inputClass} />
        </label>

        <div className="flex gap-2">
          <button onClick={save} disabled={busy !== "" || !draft.title || totalCents < 100} className="rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            {busy === "save" ? "Saving…" : "Save draft"}
          </button>
          <button onClick={() => setDraft(null)} className="rounded-lg px-4 py-2 font-medium text-muted-foreground hover:bg-muted">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs">
      {latest ? (
        <div className="p-4 rounded-xl border border-border/60 bg-card space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-foreground">{latest.title}</span>
            <AdminStatusBadge status={latest.status} size="sm" />
          </div>
          {latest.executiveSummary && <p className="text-muted-foreground line-clamp-3">{latest.executiveSummary}</p>}
          {latest.status === "changes_requested" && latest.clientNote && (
            <p className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-2 text-foreground">
              <span className="font-semibold">Client asked for changes:</span> {latest.clientNote}
            </p>
          )}
          <div className="flex justify-between font-mono text-[11px] text-muted-foreground">
            <span>Value: {formatCents(latest.totalAmount, latest.currency)}</span>
            <span>Expires: {new Date(latest.expiresAt).toLocaleDateString()}</span>
          </div>
          <div className="flex gap-2 pt-1">
            {SENDABLE.includes(latest.status) && latest.status !== "changes_requested" && (
              <button onClick={() => send(latest)} disabled={busy !== ""} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 font-semibold text-primary-foreground disabled:opacity-60">
                <Send className="h-3.5 w-3.5" /> {busy === "send" ? "Sending…" : latest.status === "expired" ? "Re-send to client" : "Send to client"}
              </button>
            )}
            {["changes_requested", "expired", "rejected"].includes(latest.status) && (
              <button onClick={() => setDraft(draftFrom(latest))} className="rounded-lg border border-border px-3 py-1.5 font-medium hover:bg-muted">
                Revise proposal
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="py-8 text-center space-y-3">
          <p className="text-muted-foreground">No proposal drafted yet for this engagement.</p>
          <div className="flex justify-center gap-2">
            <button onClick={draftWithAI} disabled={busy !== ""} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-60">
              <Sparkles className="h-3.5 w-3.5" /> {busy === "ai" ? "Drafting…" : "Draft with AI"}
            </button>
            <button onClick={() => setDraft(emptyDraft())} className="rounded-lg border border-border px-4 py-2 font-medium hover:bg-muted">
              Write manually
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProposalEditor;
