import { useState, useEffect, useMemo } from "react";
import { apiRequest, ENDPOINTS } from "@/lib/api";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AdminDataTable } from "@/components/admin/AdminDataTable";
import {
  Users, Mail, Trash2, Send, Edit3, Loader2, Sparkles, History,
  CheckCircle2, Clock, XCircle, Eye, Monitor, Smartphone, Columns,
  Code2, Check, RefreshCw
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Campaign {
  _id: string;
  subject: string;
  targetAudience: string;
  status: "queued" | "sending" | "sent" | "partially_failed" | "failed" | "pending";
  recipientCount: number;
  sentCount?: number;
  failedCount?: number;
  errorMessage?: string;
  openRate?: number;
  sentAt?: string;
  createdAt: string;
}

interface Subscriber {
  _id: string;
  email: string;
  name?: string;
  interest?: string;
  subscribed: boolean;
  createdAt: string;
}

export const AdminNewsletter = () => {
  const [subs, setSubs] = useState<Subscriber[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [tab, setTab] = useState<"subscribers" | "compose" | "history">("subscribers");
  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [targetAudience, setTargetAudience] = useState("All");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  // Live Preview State
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const [composeLayout, setComposeLayout] = useState<"split" | "editor" | "preview">("split");

  // AI Form State
  const [aiPrompt, setAiPrompt] = useState("");
  const [generating, setGenerating] = useState(false);

  const { toast } = useToast();

  const fetchSubs = async () => {
    setLoading(true);
    const { data } = await apiRequest<Subscriber[]>(ENDPOINTS.NEWSLETTER_LIST);
    if (data) setSubs(data);

    const { data: cData } = await apiRequest<any>(ENDPOINTS.CAMPAIGN_LIST);
    if (cData) {
      const list = Array.isArray(cData) ? cData : cData.campaigns || [];
      setCampaigns(list);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSubs();
  }, []);

  const retryCampaign = async (id: string) => {
    const { data, error } = await apiRequest<{ message: string }>(ENDPOINTS.CAMPAIGN_RETRY(id), { method: "POST" });
    if (error) {
      toast({ title: "Retry failed", description: error, variant: "destructive" });
      return;
    }
    toast({ title: "Retry queued", description: data?.message });
    fetchSubs();
  };

  const handleGenerateAI = async () => {
    if (!aiPrompt.trim()) return;
    setGenerating(true);
    const { data, error } = await apiRequest<{ html: string }>(ENDPOINTS.AI_EXTRACT, {
      method: "POST",
      body: { module: "emailTemplate", text: aiPrompt, prompt: aiPrompt },
    });
    setGenerating(false);
    if (data?.html) {
      setBody(data.html);
      toast({ title: "AI Email Template Generated ✅" });
    } else {
      toast({ title: "Generation Error", description: error });
    }
  };

  const handleSendCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject || !body) return;
    setSending(true);

    const { data, error } = await apiRequest(ENDPOINTS.NEWSLETTER_BROADCAST, {
      method: "POST",
      body: { subject, body, targetAudience },
    });

    setSending(false);
    if (!error) {
      toast({ title: "Campaign Dispatched Successfully 🚀" });
      setSubject("");
      setBody("");
      fetchSubs();
      setTab("history");
    } else {
      toast({ title: "Broadcast Failed", description: error });
    }
  };

  const categories = useMemo(() => {
    const set = new Set<string>();
    subs.forEach((s) => {
      if (s.interest) set.add(s.interest);
    });
    return ["All", ...Array.from(set)];
  }, [subs]);

  const filteredSubs = useMemo(() => {
    return subs.filter(
      (s) =>
        !search ||
        s.email.toLowerCase().includes(search.toLowerCase()) ||
        (s.name && s.name.toLowerCase().includes(search.toLowerCase())) ||
        (s.interest && s.interest.toLowerCase().includes(search.toLowerCase()))
    );
  }, [subs, search]);

  const audienceRecipientCount = useMemo(() => {
    if (targetAudience === "All") return subs.filter((s) => s.subscribed).length;
    return subs.filter((s) => s.subscribed && (s.interest || "General AI") === targetAudience).length;
  }, [subs, targetAudience]);

  return (
    <div className="space-y-6 font-sans">
      <AdminPageHeader
        title="Newsletter & Campaign Studio"
        description="Broadcast AI solution updates, technical newsletters, and product release notes to target audience segments."
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => setTab("compose")}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold shadow-md hover:bg-primary/90 transition-all"
            >
              <Edit3 className="h-4 w-4" /> Compose Broadcast
            </button>
          </div>
        }
      />

      {/* Tabs Bar */}
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <button
          onClick={() => setTab("subscribers")}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
            tab === "subscribers" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Users className="h-4 w-4" /> Active Subscribers ({subs.filter((s) => s.subscribed).length})
        </button>

        <button
          onClick={() => setTab("compose")}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
            tab === "compose" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Mail className="h-4 w-4" /> Campaign Composer & Live Preview
        </button>

        <button
          onClick={() => setTab("history")}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
            tab === "history" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <History className="h-4 w-4" /> Broadcast History ({campaigns.length})
        </button>
      </div>

      {/* TAB 1: SUBSCRIBERS */}
      {tab === "subscribers" && (
        <div className="space-y-4">
          <AdminDataTable
            searchQuery={search}
            onSearchChange={setSearch}
            searchPlaceholder="Filter subscribers by email, name, or interest category…"
            loading={loading}
            isEmpty={filteredSubs.length === 0}
            emptyTitle="No subscribers found"
            emptyDescription="Subscribers will appear here when users submit newsletter forms."
            onRefresh={fetchSubs}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 border-b border-border text-muted-foreground font-mono uppercase text-[10px]">
                  <tr>
                    <th className="px-4 py-3">Subscriber</th>
                    <th className="px-4 py-3">Interest Category</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Subscribed Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredSubs.map((s) => (
                    <tr key={s._id} className="hover:bg-muted/40 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-foreground">{s.name || "Subscriber"}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">{s.email}</div>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-muted-foreground">{s.interest || "General AI"}</td>
                      <td className="px-4 py-3.5">
                        <AdminStatusBadge status={s.subscribed ? "active" : "cancelled"} />
                      </td>
                      <td className="px-4 py-3.5 font-mono text-muted-foreground">
                        {new Date(s.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </AdminDataTable>
        </div>
      )}

      {/* TAB 2: COMPOSE CAMPAIGN WITH LIVE EMAIL PREVIEW */}
      {tab === "compose" && (
        <div className="space-y-6">
          {/* AI Generator Header Bar */}
          <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-3 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                <Sparkles className="h-4 w-4 text-primary" /> AI HTML Email Generator
              </div>

              {/* View Layout Switcher */}
              <div className="flex items-center bg-background border border-border/60 rounded-lg p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setComposeLayout("split")}
                  className={`px-2.5 py-1 rounded-md font-medium flex items-center gap-1 transition-all ${
                    composeLayout === "split" ? "bg-muted text-foreground font-bold" : "text-muted-foreground"
                  }`}
                >
                  <Columns className="h-3.5 w-3.5" /> Split Screen
                </button>
                <button
                  type="button"
                  onClick={() => setComposeLayout("editor")}
                  className={`px-2.5 py-1 rounded-md font-medium flex items-center gap-1 transition-all ${
                    composeLayout === "editor" ? "bg-muted text-foreground font-bold" : "text-muted-foreground"
                  }`}
                >
                  <Code2 className="h-3.5 w-3.5" /> Editor Only
                </button>
                <button
                  type="button"
                  onClick={() => setComposeLayout("preview")}
                  className={`px-2.5 py-1 rounded-md font-medium flex items-center gap-1 transition-all ${
                    composeLayout === "preview" ? "bg-muted text-foreground font-bold" : "text-muted-foreground"
                  }`}
                >
                  <Eye className="h-3.5 w-3.5" /> Live Preview
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="e.g. SunTriX AI opens new office in Islamabad with state-of-the-art AI lab…"
                className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                type="button"
                onClick={handleGenerateAI}
                disabled={generating}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold shadow-md flex items-center gap-1.5 hover:bg-primary/90 transition-all shrink-0"
              >
                {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {generating ? "Drafting HTML…" : "Generate HTML"}
              </button>
            </div>

            {/* Quick Prompt Presets */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-muted-foreground">
              <span className="font-semibold">Quick Prompts:</span>
              <button
                type="button"
                onClick={() => {
                  setAiPrompt("SunTriX AI opens new state-of-the-art AI engineering office in Islamabad with modern facilities");
                  setSubject("SunTriX AI Opens New State-of-the-Art Office in Islamabad 🚀");
                }}
                className="px-2 py-0.5 rounded-full bg-background border border-border/60 hover:border-primary/50 hover:text-foreground transition-all font-mono"
              >
                ⚡ Islamabad Office Opening
              </button>
              <button
                type="button"
                onClick={() => {
                  setAiPrompt("Announcement of autonomous Agentic AI Workflows platform with multi-agent orchestration");
                  setSubject("Introducing SunTriX Autonomous Agentic Workflows 🤖");
                }}
                className="px-2 py-0.5 rounded-full bg-background border border-border/60 hover:border-primary/50 hover:text-foreground transition-all font-mono"
              >
                🚀 Agentic Workflows Launch
              </button>
              <button
                type="button"
                onClick={() => {
                  setAiPrompt("Quarterly AI Engineering Insights: Vision AI breakthroughs, client metrics, and product roadmap");
                  setSubject("SunTriX Q3 AI Engineering Insights & Case Studies 📰");
                }}
                className="px-2 py-0.5 rounded-full bg-background border border-border/60 hover:border-primary/50 hover:text-foreground transition-all font-mono"
              >
                📰 Quarterly AI Digest
              </button>
            </div>
          </div>

          {/* MAIN COMPOSE GRID & LIVE PREVIEW CONTAINER */}
          <form onSubmit={handleSendCampaign} className="space-y-6">
            {/* Subject and Target Audience Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-card border border-border/60 rounded-xl p-4 shadow-2xs">
              <div className="md:col-span-2">
                <label className="text-muted-foreground font-mono text-xs block mb-1 font-semibold">Subject Line *</label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="SunTriX Quarterly AI Insights & Case Studies"
                  className="w-full bg-background border border-border/60 rounded-lg px-3 py-2 text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="text-muted-foreground font-mono text-xs block mb-1 font-semibold">
                  Target Category Audience * ({audienceRecipientCount} recipient{audienceRecipientCount !== 1 ? "s" : ""})
                </label>
                <select
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  className="w-full bg-background border border-border/60 rounded-lg px-3 py-2 text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="All">All Active Subscribers ({subs.filter((s) => s.subscribed).length})</option>
                  {categories.filter((c) => c !== "All").map((cat) => {
                    const count = subs.filter((s) => s.subscribed && (s.interest || "General AI") === cat).length;
                    return (
                      <option key={cat} value={cat}>
                        {cat} ({count} subscriber{count !== 1 ? "s" : ""})
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {/* SPLIT SCREEN / EDITOR & PREVIEW WORKSPACE */}
            <div className={`grid gap-6 ${
              composeLayout === "split" ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"
            }`}>
              {/* LEFT: HTML EDITOR */}
              {(composeLayout === "split" || composeLayout === "editor") && (
                <div className="bg-card border border-border/60 rounded-xl p-4 space-y-3 flex flex-col justify-between shadow-2xs">
                  <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
                    <span className="text-xs font-mono font-bold text-foreground flex items-center gap-1.5">
                      <Code2 className="h-4 w-4 text-primary" /> HTML Source Code
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {body.length} characters
                    </span>
                  </div>

                  <textarea
                    required
                    rows={18}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="<html><body><h1>Hello Subscriber</h1></body></html>"
                    className="w-full flex-1 bg-background border border-border/60 rounded-lg p-3 text-foreground font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary resize-y min-h-[380px]"
                  />
                </div>
              )}

              {/* RIGHT: REAL-TIME LIVE EMAIL PREVIEW */}
              {(composeLayout === "split" || composeLayout === "preview") && (
                <div className="bg-card border border-border/60 rounded-xl p-4 space-y-3 flex flex-col justify-between shadow-2xs">
                  {/* Preview Toolbar */}
                  <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
                    <span className="text-xs font-mono font-bold text-foreground flex items-center gap-1.5">
                      <Eye className="h-4 w-4 text-emerald-500" /> Live HTML Email Preview
                    </span>

                    {/* Device Switcher */}
                    <div className="flex items-center bg-muted/60 border border-border/60 rounded-lg p-0.5 text-xs">
                      <button
                        type="button"
                        onClick={() => setPreviewDevice("desktop")}
                        className={`px-2.5 py-1 rounded-md font-medium flex items-center gap-1 transition-all ${
                          previewDevice === "desktop" ? "bg-background text-foreground shadow-2xs font-bold" : "text-muted-foreground"
                        }`}
                      >
                        <Monitor className="h-3.5 w-3.5" /> Desktop (600px)
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewDevice("mobile")}
                        className={`px-2.5 py-1 rounded-md font-medium flex items-center gap-1 transition-all ${
                          previewDevice === "mobile" ? "bg-background text-foreground shadow-2xs font-bold" : "text-muted-foreground"
                        }`}
                      >
                        <Smartphone className="h-3.5 w-3.5" /> Mobile (375px)
                      </button>
                    </div>
                  </div>

                  {/* Email Preview Outer Frame */}
                  <div className="flex-1 bg-muted/30 p-4 rounded-xl border border-border/40 flex flex-col items-center justify-start min-h-[380px] overflow-y-auto">
                    <div
                      className={`bg-white text-zinc-900 shadow-xl rounded-xl overflow-hidden transition-all duration-300 border border-zinc-200 flex flex-col ${
                        previewDevice === "mobile" ? "w-[375px] h-[520px]" : "w-full max-w-[620px] min-h-[480px]"
                      }`}
                    >
                      {/* Email Header Bar Simulation */}
                      <div className="bg-zinc-100 border-b border-zinc-200 p-3 space-y-1 text-left text-[11px] font-sans">
                        <div className="flex items-center justify-between text-zinc-500">
                          <span>From: <strong className="text-zinc-800">SunTriX AI Solutions &lt;newsletter@suntrix.ai&gt;</strong></span>
                          <span className="font-mono text-[10px]">Just now</span>
                        </div>
                        <div className="text-zinc-700">
                          Subject: <strong className="text-zinc-900 font-semibold">{subject || "(No Subject Line Provided)"}</strong>
                        </div>
                        <div className="text-zinc-500 text-[10px]">
                          To: <span className="font-mono">{targetAudience} Subscribers ({audienceRecipientCount})</span>
                        </div>
                      </div>

                      {/* Rendered HTML Content inside Iframe */}
                      {body ? (
                        <iframe
                          srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"/><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;margin:0;padding:16px;color:#18181b;line-height:1.6;}</style></head><body>${body}</body></html>`}
                          title="Live Email Body Preview"
                          className="w-full flex-1 border-0 bg-white"
                        />
                      ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-zinc-400 space-y-2">
                          <Eye className="h-10 w-10 text-zinc-300" />
                          <p className="text-xs font-bold text-zinc-600">Real-Time Email Live Preview</p>
                          <p className="text-[11px] max-w-xs leading-relaxed text-zinc-500">
                            Use the AI Generator above or type HTML content in the editor on the left to inspect live rendering.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Action Bar */}
            <div className="flex items-center justify-between bg-card border border-border/60 rounded-xl p-4 shadow-2xs">
              <div className="text-xs text-muted-foreground font-mono">
                Ready to send to <strong className="text-foreground">{audienceRecipientCount} active subscribers</strong>
              </div>

              <button
                type="submit"
                disabled={sending || !subject || !body}
                className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold shadow-md text-xs hover:bg-primary/90 disabled:opacity-50 transition-all"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {sending ? "Dispatching Broadcast…" : "Dispatch Broadcast Now"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 3: BROADCAST HISTORY */}
      {tab === "history" && (
        <AdminDataTable
          loading={loading}
          isEmpty={campaigns.length === 0}
          emptyTitle="No campaign history"
          emptyDescription="Dispatched campaigns will be recorded here with delivery stats."
          onRefresh={fetchSubs}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 border-b border-border text-muted-foreground font-mono uppercase text-[10px]">
                <tr>
                  <th className="px-4 py-3">Subject</th>
                  <th className="px-4 py-3">Audience</th>
                  <th className="px-4 py-3">Recipients</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Sent At</th>
                  <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {campaigns.map((c) => (
                  <tr key={c._id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-4 py-3.5 font-semibold text-foreground">{c.subject}</td>
                    <td className="px-4 py-3.5 font-mono text-muted-foreground">{c.targetAudience}</td>
                    <td className="px-4 py-3.5 font-mono font-bold text-foreground">
                      {c.sentCount !== undefined && c.status !== "sent" ? `${c.sentCount} / ${c.recipientCount}` : c.recipientCount}
                    </td>
                    <td className="px-4 py-3.5" title={c.errorMessage || undefined}>
                      <AdminStatusBadge status={c.status} />
                      {!!c.failedCount && <span className="ml-2 text-rose-600">{c.failedCount} failed</span>}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-muted-foreground">
                      {new Date(c.sentAt || c.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {(c.status === "failed" || c.status === "partially_failed") && (
                        <button
                          onClick={() => retryCampaign(c._id)}
                          className="px-2.5 py-1 rounded-md border border-border text-xs font-semibold hover:bg-muted"
                        >
                          Retry failed
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdminDataTable>
      )}
    </div>
  );
};

export default AdminNewsletter;
