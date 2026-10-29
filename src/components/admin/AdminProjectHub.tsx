import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest, ENDPOINTS, apiUpload } from "@/lib/api";
import { notify } from "@/lib/notify";
import { safeHref } from "@/lib/sanitize";
import {
  CheckCircle2, Clock, Send, Upload, FileText,
  Eye, ExternalLink, ChevronRight, Flag, Zap,
  MessageSquare, BarChart3, FolderOpen, History,
  ArrowRight, Loader2, DollarSign, Star, AlertTriangle, CheckCheck
} from "lucide-react";

interface AdminProjectHubProps {
  taskId: string;
}

const phases = ["Discovery", "Design", "Development", "Testing", "Delivery"];

const phaseColors: Record<string, string> = {
  Discovery:   "from-violet-500 to-purple-600",
  Design:      "from-blue-500 to-cyan-500",
  Development: "from-orange-500 to-amber-500",
  Testing:     "from-rose-500 to-pink-600",
  Delivery:    "from-emerald-500 to-teal-500",
};

const TABS = [
  { id: "overview",     label: "Overview",     icon: BarChart3 },
  { id: "deliverables", label: "Deliverables",  icon: CheckCircle2 },
  { id: "milestones",   label: "Milestones",    icon: DollarSign },
  { id: "updates",      label: "Updates",       icon: Zap },
  { id: "files",        label: "Files",         icon: FolderOpen },
  { id: "chat",         label: "Chat",          icon: MessageSquare },
  { id: "audit",        label: "Audit",         icon: History },
];

const AdminProjectHub = ({ taskId }: AdminProjectHubProps) => {
  const [tracker, setTracker] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [newUpdate, setNewUpdate] = useState({ type: "ProgressUpdate", body: "", nextUpdateDue: "" });
  const [chatMessage, setChatMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [markingPayable, setMarkingPayable] = useState<string | null>(null);
  const [requestingCompletion, setRequestingCompletion] = useState(false);
  const [completingDeliverable, setCompletingDeliverable] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const fetchTracker = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await apiRequest<{ trackers: any[] }>(ENDPOINTS.TRACKER_ADMIN_FOR_TASK(taskId));
      if (data?.trackers) {
        const found = data.trackers[0];
        if (found) {
          const { data: detail } = await apiRequest<{ tracker: any }>(ENDPOINTS.TRACKER_ADMIN_BY_ID(found._id));
          if (detail?.tracker) {
            setTracker(detail.tracker);
          } else {
            setTracker(null);
          }
        } else {
          setTracker(null);
        }
      }
    } catch (err) { console.error(err); }
    finally { if (!silent) setLoading(false); }
  };

  const fetchAuditLog = async () => {
    if (!tracker?._id) return;
    const { data } = await apiRequest<{ auditLog: any[] }>(ENDPOINTS.TRACKER_ADMIN_AUDIT(tracker._id));
    if (data?.auditLog) setAuditLog(data.auditLog.slice().reverse());
  };

  useEffect(() => {
    fetchTracker();
    // Poll for client activity, but not while the browser tab is hidden
    const interval = setInterval(() => {
      if (!document.hidden) fetchTracker(true);
    }, 8000);
    return () => clearInterval(interval);
  }, [taskId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [tracker?.messages]);

  useEffect(() => {
    if (activeTab === "audit" && tracker?._id) fetchAuditLog();
  }, [activeTab, tracker?._id]);

  const handleAdvancePhase = async () => {
    const currentPhaseIdx = phases.indexOf(tracker.currentPhase);
    const nextPhase = phases[currentPhaseIdx + 1];
    if (!nextPhase) return;
    if (!confirm(`Advance project to "${nextPhase}" phase?`)) return;
    const { error } = await apiRequest(ENDPOINTS.TRACKER_ADMIN_PHASE_ADVANCE(tracker._id), {
      method: "POST", body: { nextPhase },
    });
    if (error) notify.error("Failed to advance phase.");
    else { notify.success(`Phase advanced to ${nextPhase}!`); fetchTracker(true); }
  };

  const handleCompleteDeliverable = async (dId: string) => {
    setCompletingDeliverable(dId);
    const { error } = await apiRequest(ENDPOINTS.TRACKER_ADMIN_DELIVERABLE_DONE(tracker._id, dId), { method: "POST" });
    setCompletingDeliverable(null);
    if (error) notify.error("Failed.");
    else { notify.success("Client notified to review!"); fetchTracker(true); }
  };

  const handlePostUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUpdate.body.trim()) return;
    setSubmitting(true);
    const { error } = await apiRequest(ENDPOINTS.TRACKER_ADMIN_UPDATE(tracker._id), {
      method: "POST", body: newUpdate,
    });
    setSubmitting(false);
    if (error) notify.error("Failed to post update.");
    else { notify.success("Update posted & client notified!"); setNewUpdate({ type: "ProgressUpdate", body: "", nextUpdateDue: "" }); fetchTracker(true); }
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    const msg = chatMessage.trim();
    if (!msg) return;
    setChatMessage("");
    setTracker((prev: any) => prev ? {
      ...prev,
      messages: [...(prev.messages || []), { sender: "Admin", text: msg, sentAt: new Date().toISOString() }]
    } : prev);
    const { error } = await apiRequest(ENDPOINTS.TRACKER_ADMIN_CHAT(tracker._id), { method: "POST", body: { text: msg } });
    if (error) { notify.error("Failed to send message."); fetchTracker(true); }
  };

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setUploadingFile(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const { error } = await apiUpload(ENDPOINTS.TRACKER_ADMIN_FILE_UPLOAD(tracker._id), formData);
      if (error) throw new Error(error);
      notify.success("File uploaded & client notified!");
      fetchTracker(true);
    } catch (err) {
      notify.error(`Upload failed: ${err instanceof Error ? err.message : "please try again"}`);
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleMarkPayable = async (mId: string, title: string) => {
    if (!confirm(`Send payment request to client for "${title}"?`)) return;
    setMarkingPayable(mId);
    const { error } = await apiRequest(ENDPOINTS.TRACKER_ADMIN_MILESTONE_PAYABLE(tracker._id, mId), { method: "POST" });
    setMarkingPayable(null);
    if (error) return notify.error("Failed to mark payable.");
    notify.success("Payment request sent to client!");
    fetchTracker(true);
  };

  const handleMarkPaidManually = async (mId: string, title: string) => {
    const note = window.prompt(`Record an off-platform payment for "${title}"? Add a reference (bank transfer, cheque…):`);
    if (note === null) return;
    setMarkingPayable(mId);
    const { error } = await apiRequest(ENDPOINTS.TRACKER_ADMIN_MILESTONE_PAID_MANUALLY(tracker._id, mId), { method: "POST", body: { note } });
    setMarkingPayable(null);
    if (error) return notify.error(error);
    notify.success("Milestone recorded as paid.");
    fetchTracker(true);
  };

  const handleRequestCompletion = async () => {
    if (!confirm("Send final sign-off request to the client? They will receive an email to approve project completion.")) return;
    setRequestingCompletion(true);
    const { error } = await apiRequest(ENDPOINTS.TRACKER_ADMIN_COMPLETION_REQUEST(tracker._id), { method: "POST" });
    setRequestingCompletion(false);
    if (error) return notify.error("Failed to send sign-off request.");
    notify.success("Sign-off request sent to client!");
    fetchTracker(true);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm font-medium">Loading project hub…</p>
      </div>
    );
  }

  if (!tracker) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground p-8">
        <div className="h-16 w-16 rounded-full bg-muted/30 flex items-center justify-center mb-2">
          <Clock className="h-8 w-8 opacity-40" />
        </div>
        <p className="font-semibold text-foreground">No Project Hub yet</p>
        <p className="text-xs text-center max-w-xs">A tracking hub is created automatically once the contract is signed.</p>
      </div>
    );
  }

  const currentPhaseIdx = phases.indexOf(tracker.currentPhase);
  const unreadCount = tracker.messages?.filter((m: any) => m.sender === "Client" && !m.readByAdmin).length || 0;
  const approvedDeliverables = tracker.deliverables?.filter((d: any) => d.status === "Approved").length || 0;
  const paidMilestones = tracker.milestones?.filter((m: any) => m.paidAt).length || 0;
  const totalRevenueCents = tracker.milestones?.filter((m: any) => m.paidAt).reduce((s: number, m: any) => s + m.amount, 0) || 0;
  const isDeliveryPhase = currentPhaseIdx === phases.length - 1;
  const phaseGradient = phaseColors[tracker.currentPhase] || "from-primary to-primary/80";

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden w-full">

      {/* ── Header ── */}
      <div className={`px-6 py-4 bg-gradient-to-r ${phaseGradient} bg-opacity-10 border-b border-border shrink-0`}
        style={{ background: `linear-gradient(135deg, hsl(var(--primary)/0.08), hsl(var(--primary)/0.03))` }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-primary mb-0.5">Active Phase</p>
            <div className="flex items-center gap-2">
              <div className={`h-2.5 w-2.5 rounded-full bg-gradient-to-r ${phaseGradient} animate-pulse`} />
              <span className="font-extrabold text-lg text-foreground">{tracker.currentPhase}</span>
            </div>
          </div>
          <a
            href={`/client/project/${tracker.trackerToken}`}
            target="_blank" rel="noreferrer"
            className="flex items-center gap-1.5 text-xs bg-primary/10 hover:bg-primary hover:text-white text-primary border border-primary/20 px-3 py-1.5 rounded-lg font-medium transition-all"
          >
            <ExternalLink className="h-3 w-3" /> Client Portal
          </a>
        </div>
      </div>

      {/* ── Phase Stepper ── */}
      <div className="px-6 py-4 border-b border-border bg-card/40 shrink-0">
        <div className="flex items-center gap-1">
          {phases.map((p, i) => {
            const isCompleted = i < currentPhaseIdx;
            const isCurrent  = i === currentPhaseIdx;
            return (
              <div key={p} className="flex items-center flex-1">
                <div className="flex flex-col items-center gap-1 flex-1">
                  <motion.div
                    initial={{ scale: 0.8 }}
                    animate={{ scale: isCurrent ? 1.1 : 1 }}
                    className={`h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold border-2 transition-all ${
                      isCompleted ? `bg-gradient-to-br ${phaseGradient} border-transparent text-white shadow-lg` :
                      isCurrent   ? "bg-background border-primary text-primary ring-4 ring-primary/20" :
                                    "bg-muted/30 border-muted text-muted-foreground"
                    }`}
                  >
                    {isCompleted ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                  </motion.div>
                  <span className={`text-[9px] font-semibold hidden sm:block ${isCurrent ? "text-primary" : isCompleted ? "text-muted-foreground" : "text-muted-foreground/50"}`}>{p}</span>
                </div>
                {i < phases.length - 1 && (
                  <div className={`h-0.5 flex-1 mx-1 rounded-full transition-all ${isCompleted ? `bg-gradient-to-r ${phaseGradient}` : "bg-muted"}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Phase Action Button */}
        <div className="mt-4 flex justify-end">
          {!isDeliveryPhase ? (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleAdvancePhase}
              className={`flex items-center gap-2 text-sm bg-gradient-to-r ${phaseGradient} text-white px-4 py-2 rounded-xl font-bold shadow-md hover:shadow-lg transition-shadow`}
            >
              <ArrowRight className="h-4 w-4" /> Advance to {phases[currentPhaseIdx + 1]}
            </motion.button>
          ) : tracker.completionApprovedAt ? (
            <div className="flex items-center gap-2 text-sm bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-4 py-2 rounded-xl font-bold">
              <CheckCheck className="h-4 w-4" /> Project Completed ✓
            </div>
          ) : tracker.completionRequestedAt ? (
            <div className="flex items-center gap-2 text-sm bg-amber-500/10 text-amber-500 border border-amber-500/20 px-4 py-2 rounded-xl font-semibold animate-pulse">
              <Clock className="h-4 w-4" /> Awaiting Client Sign-Off…
            </div>
          ) : (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleRequestCompletion}
              disabled={requestingCompletion}
              className="flex items-center gap-2 text-sm bg-gradient-to-r from-emerald-500 to-teal-600 text-white px-4 py-2 rounded-xl font-bold shadow-md hover:shadow-emerald-500/30 hover:shadow-lg transition-all disabled:opacity-60"
            >
              {requestingCompletion ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className="h-4 w-4" />}
              Request Final Client Sign-Off
            </motion.button>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex border-b border-border bg-card/20 shrink-0 overflow-x-auto">
        {TABS.map(tab => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          const badge = tab.id === "chat" && unreadCount > 0;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap border-b-2 -mb-px transition-all ${
                isActive ? "border-primary text-primary bg-primary/5" : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30"
              }`}
            >
              <Icon className={`h-3.5 w-3.5 ${isActive ? "text-primary" : ""}`} />
              {tab.label}
              {badge && <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />}
            </button>
          );
        })}
      </div>

      {/* ── Tab Content ── */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="h-full"
          >

            {/* ══ OVERVIEW ══ */}
            {activeTab === "overview" && (
              <div className="p-6 space-y-6">
                {/* KPI Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { label: "Deliverables", value: `${approvedDeliverables}/${tracker.deliverables?.length || 0}`, sub: "approved", icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10" },
                    { label: "Milestones",   value: `${paidMilestones}/${tracker.milestones?.length || 0}`,          sub: "paid",     icon: DollarSign, color: "text-blue-400",    bg: "bg-blue-500/10" },
                    { label: "Revenue",      value: `$${(totalRevenueCents / 100).toFixed(0)}`,                       sub: "collected", icon: BarChart3,  color: "text-violet-400", bg: "bg-violet-500/10" },
                    { label: "Updates",      value: tracker.updates?.length || 0,                                     sub: "posted",   icon: Zap,        color: "text-amber-400",  bg: "bg-amber-500/10" },
                  ].map(card => (
                    <motion.div
                      key={card.label}
                      whileHover={{ scale: 1.02, y: -2 }}
                      className="bg-card border border-border rounded-xl p-4 hover:border-border/80 hover:shadow-lg transition-all"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-muted-foreground font-medium">{card.label}</p>
                        <div className={`h-7 w-7 rounded-lg ${card.bg} flex items-center justify-center`}>
                          <card.icon className={`h-3.5 w-3.5 ${card.color}`} />
                        </div>
                      </div>
                      <p className="text-2xl font-black text-foreground">{card.value}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{card.sub}</p>
                    </motion.div>
                  ))}
                </div>

                {/* Recent Activity */}
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
                    <History className="h-3.5 w-3.5" /> Recent Activity
                  </p>
                  <div className="space-y-2">
                    {tracker.auditLog?.slice(-6).reverse().map((entry: any, i: number) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="flex items-start gap-3 p-3 rounded-xl bg-muted/20 border border-border/50 hover:bg-muted/40 transition-colors"
                      >
                        <div className="h-2 w-2 rounded-full bg-primary mt-1.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-foreground truncate">{entry.action}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{entry.actor} · {new Date(entry.timestamp).toLocaleString()}</p>
                        </div>
                      </motion.div>
                    ))}
                    {(!tracker.auditLog || tracker.auditLog.length === 0) && (
                      <p className="text-xs text-muted-foreground text-center py-6">No activity yet.</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ══ DELIVERABLES ══ */}
            {activeTab === "deliverables" && (
              <div className="p-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {(["Pending", "InReview", "Approved"] as const).map(status => {
                    const items = tracker.deliverables?.filter((d: any) => d.status === status) || [];
                    const colors: Record<string, string> = {
                      Pending:  "border-muted bg-muted/20",
                      InReview: "border-amber-500/30 bg-amber-500/5",
                      Approved: "border-emerald-500/30 bg-emerald-500/5",
                    };
                    const labels: Record<string, string> = {
                      Pending: "Pending", InReview: "In Review", Approved: "Approved",
                    };
                    const badgeColors: Record<string, string> = {
                      Pending:  "bg-muted text-muted-foreground",
                      InReview: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
                      Approved: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
                    };
                    return (
                      <div key={status} className={`rounded-xl border p-4 ${colors[status]}`}>
                        <div className="flex items-center justify-between mb-4">
                          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${badgeColors[status]}`}>{labels[status]}</span>
                          <span className="text-xs text-muted-foreground font-bold">{items.length}</span>
                        </div>
                        <div className="space-y-2">
                          {items.map((d: any) => (
                            <motion.div
                              key={d._id}
                              layout
                              className="bg-card border border-border rounded-lg p-3 space-y-2"
                            >
                              <p className="text-sm font-semibold text-foreground leading-tight">{d.title}</p>
                              {d.clientRejectionNote && (
                                <div className="flex items-start gap-1.5 text-xs text-rose-400 bg-rose-500/10 p-2 rounded-lg">
                                  <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                                  <span>{d.clientRejectionNote}</span>
                                </div>
                              )}
                              {d.attachedUrl && (
                                <a href={safeHref(d.attachedUrl)} target="_blank" rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline">
                                  <Eye className="h-3 w-3" /> View Attachment
                                </a>
                              )}
                              {(d.status === "Pending" || d.status === "Rejected") && (
                                <button
                                  onClick={() => handleCompleteDeliverable(d._id)}
                                  disabled={completingDeliverable === d._id}
                                  className="w-full text-xs bg-primary/10 hover:bg-primary hover:text-white text-primary border border-primary/20 py-1.5 rounded-lg font-bold flex items-center justify-center gap-1 transition-all disabled:opacity-50"
                                >
                                  {completingDeliverable === d._id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                                  Send for Review
                                </button>
                              )}
                            </motion.div>
                          ))}
                          {items.length === 0 && (
                            <p className="text-xs text-muted-foreground text-center py-4 opacity-50">None</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Rejected deliverables in a separate section */}
                {tracker.deliverables?.some((d: any) => d.status === "Rejected") && (
                  <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/5 p-4">
                    <p className="text-xs font-bold text-rose-400 uppercase tracking-wider mb-3">Needs Revision</p>
                    {tracker.deliverables.filter((d: any) => d.status === "Rejected").map((d: any) => (
                      <div key={d._id} className="bg-card border border-rose-500/20 rounded-lg p-3 mb-2 space-y-1.5">
                        <p className="text-sm font-semibold">{d.title}</p>
                        <p className="text-xs text-rose-300 italic">"{d.clientRejectionNote}"</p>
                        <button
                          onClick={() => handleCompleteDeliverable(d._id)}
                          disabled={completingDeliverable === d._id}
                          className="text-xs bg-rose-500 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-rose-600 transition-colors disabled:opacity-50"
                        >
                          Re-submit for Review
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ══ MILESTONES ══ */}
            {activeTab === "milestones" && (
              <div className="p-6 space-y-3">
                {tracker.milestones?.map((m: any, idx: number) => (
                  <motion.div
                    key={m._id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.07 }}
                    className={`rounded-xl border p-4 transition-all ${m.paidAt ? "border-emerald-500/30 bg-emerald-500/5" : m.paymentRequestedAt ? "border-amber-500/30 bg-amber-500/5" : "border-border bg-card"}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold text-muted-foreground">#{idx + 1}</span>
                          <p className="text-sm font-bold text-foreground">{m.title}</p>
                        </div>
                        <p className="text-2xl font-black text-foreground">${(m.amount / 100).toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Due: {new Date(m.dueDate).toLocaleDateString("en-US", { dateStyle: "medium" })}
                        </p>
                        {m.paidAt && (
                          <p className="text-xs text-emerald-400 mt-1">
                            Paid on {new Date(m.paidAt).toLocaleDateString("en-US", { dateStyle: "medium" })}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0">
                        {m.paidAt ? (
                          <div className="flex items-center gap-1.5 text-xs bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-xl font-bold">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Paid
                          </div>
                        ) : m.paymentRequestedAt ? (
                          <div className="flex flex-col items-end gap-2">
                            <div className="text-xs bg-amber-500/15 text-amber-400 border border-amber-500/30 px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1">
                              <Clock className="h-3 w-3" /> Awaiting Payment
                            </div>
                            <button
                              onClick={() => handleMarkPaidManually(m._id, m.title)}
                              disabled={markingPayable === m._id}
                              className="text-[11px] text-muted-foreground hover:text-foreground underline disabled:opacity-60"
                            >
                              Paid outside Stripe?
                            </button>
                          </div>
                        ) : (
                          <motion.button
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => handleMarkPayable(m._id, m.title)}
                            disabled={markingPayable === m._id}
                            className="text-xs bg-gradient-to-r from-primary to-primary/80 text-primary-foreground px-3 py-2 rounded-xl font-bold hover:shadow-md hover:shadow-primary/20 transition-all disabled:opacity-60 flex items-center gap-1.5"
                          >
                            {markingPayable === m._id ? <Loader2 className="h-3 w-3 animate-spin" /> : <DollarSign className="h-3 w-3" />}
                            {markingPayable === m._id ? "Sending…" : "Send Invoice"}
                          </motion.button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
                {(!tracker.milestones || tracker.milestones.length === 0) && (
                  <p className="text-xs text-muted-foreground text-center py-12">No milestones defined.</p>
                )}
              </div>
            )}

            {/* ══ UPDATES ══ */}
            {activeTab === "updates" && (
              <div className="p-6 space-y-6">
                <form onSubmit={handlePostUpdate} className="bg-card border border-border rounded-xl p-5 space-y-4">
                  <p className="text-sm font-bold text-foreground flex items-center gap-2"><Zap className="h-4 w-4 text-primary" /> Post Update to Client</p>
                  <select
                    value={newUpdate.type}
                    onChange={e => setNewUpdate({ ...newUpdate, type: e.target.value })}
                    className="w-full text-sm p-2.5 rounded-xl border border-border bg-background focus:ring-1 focus:ring-primary outline-none"
                  >
                    <option value="ProgressUpdate">📊 Progress Update</option>
                    <option value="Blocker">🚧 Blocker</option>
                    <option value="MilestoneReached">🎯 Milestone Reached</option>
                    <option value="ActionRequired">⚠️ Action Required (Client)</option>
                  </select>
                  <textarea
                    value={newUpdate.body}
                    onChange={e => setNewUpdate({ ...newUpdate, body: e.target.value })}
                    placeholder="Describe the update for the client…"
                    rows={3}
                    className="w-full text-sm p-2.5 rounded-xl border border-border bg-background resize-none focus:ring-1 focus:ring-primary outline-none"
                  />
                  <div className="flex items-center gap-3">
                    <input
                      type="date"
                      value={newUpdate.nextUpdateDue}
                      onChange={e => setNewUpdate({ ...newUpdate, nextUpdateDue: e.target.value })}
                      className="flex-1 text-sm p-2.5 rounded-xl border border-border bg-background focus:ring-1 focus:ring-primary outline-none"
                      placeholder="Next update due (optional)"
                    />
                    <button
                      type="submit"
                      disabled={submitting || !newUpdate.body.trim()}
                      className="px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      {submitting ? "Posting…" : "Post & Notify"}
                    </button>
                  </div>
                </form>
                <div className="space-y-3">
                  {tracker.updates?.map((u: any, i: number) => (
                    <div key={u._id || i} className="flex gap-3">
                      <div className="w-2 shrink-0 mt-1.5">
                        <div className="h-2 w-2 rounded-full bg-primary" />
                        <div className="w-px h-full bg-border mx-auto mt-1" />
                      </div>
                      <div className="flex-1 bg-card border border-border rounded-xl p-4 mb-2">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-bold text-primary">{u.type}</span>
                          {u.clientAcknowledgedAt && <span className="text-[10px] text-emerald-400 flex items-center gap-1"><CheckCheck className="h-3 w-3" />Acknowledged</span>}
                        </div>
                        <p className="text-sm text-foreground leading-relaxed">{u.body}</p>
                        <p className="text-[10px] text-muted-foreground mt-2">{new Date(u.postedAt).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ══ FILES ══ */}
            {activeTab === "files" && (
              <div className="p-6 space-y-5">
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => {
                    e.preventDefault();
                    setDragOver(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) handleFileUpload(file);
                  }}
                  className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${dragOver ? "border-primary bg-primary/10 scale-[1.01]" : "border-border bg-muted/20 hover:border-primary/50 hover:bg-primary/5"}`}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className={`h-14 w-14 rounded-2xl mx-auto mb-4 flex items-center justify-center transition-all ${dragOver ? "bg-primary/20" : "bg-muted/40"}`}>
                    {uploadingFile ? <Loader2 className="h-7 w-7 animate-spin text-primary" /> : <Upload className={`h-7 w-7 ${dragOver ? "text-primary" : "text-muted-foreground"}`} />}
                  </div>
                  <p className="font-semibold text-sm text-foreground mb-1">{uploadingFile ? "Uploading…" : dragOver ? "Drop to upload!" : "Drag & drop or click to upload"}</p>
                  <p className="text-xs text-muted-foreground">PDF, Word, Images, ZIP — max 50MB</p>
                  <input ref={fileInputRef} type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }}
                    accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip" />
                </div>

                <div className="space-y-2">
                  {tracker.files?.map((f: any) => (
                    <motion.div key={f._id} layout className="bg-card border border-border rounded-xl p-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                          <FileText className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{f.filename}</p>
                          <p className="text-[10px] text-muted-foreground">{new Date(f.uploadedAt).toLocaleDateString()}</p>
                          {f.clientComment && <p className="text-[10px] text-amber-400 italic mt-0.5">"{f.clientComment}"</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                          f.approvalStatus === "Approved" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" :
                          f.approvalStatus === "Rejected" ? "bg-rose-500/10 text-rose-400 border-rose-500/30" :
                          "bg-amber-500/10 text-amber-400 border-amber-500/30"
                        }`}>{f.approvalStatus}</span>
                        <a href={safeHref(f.cloudinaryUrl)} target="_blank" rel="noreferrer"
                          className="h-8 w-8 rounded-lg bg-muted/50 hover:bg-primary hover:text-white text-muted-foreground flex items-center justify-center transition-all">
                          <Eye className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    </motion.div>
                  ))}
                  {(!tracker.files || tracker.files.length === 0) && (
                    <p className="text-xs text-muted-foreground text-center py-8">No files shared yet.</p>
                  )}
                </div>
              </div>
            )}

            {/* ══ CHAT ══ */}
            {activeTab === "chat" && (
              <div className="flex flex-col h-full" style={{ minHeight: 0 }}>
                <div className="flex-1 overflow-y-auto p-5 space-y-3">
                  {!tracker.messages?.length && (
                    <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
                      <MessageSquare className="h-10 w-10 opacity-20" />
                      <p className="text-xs">No messages yet. Start the conversation.</p>
                    </div>
                  )}
                  {tracker.messages?.map((msg: any, i: number) => {
                    const isAdmin = msg.sender === "Admin";
                    return (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 8, x: isAdmin ? 8 : -8 }}
                        animate={{ opacity: 1, y: 0, x: 0 }}
                        className={`flex flex-col max-w-[80%] ${isAdmin ? "self-end items-end ml-auto" : "self-start items-start"}`}
                      >
                        <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                          isAdmin
                            ? "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground rounded-br-sm"
                            : "bg-muted border border-border text-foreground rounded-bl-sm"
                        }`}>
                          {msg.text}
                        </div>
                        <span className="text-[10px] text-muted-foreground mt-1">
                          {new Date(msg.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </motion.div>
                    );
                  })}
                  <div ref={chatEndRef} />
                </div>
                <form onSubmit={handleSendChat} className="p-4 border-t border-border flex gap-2 bg-card/40">
                  <input
                    type="text"
                    value={chatMessage}
                    onChange={e => setChatMessage(e.target.value)}
                    placeholder="Message client…"
                    className="flex-1 bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <motion.button
                    type="submit"
                    disabled={!chatMessage.trim()}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="bg-primary text-primary-foreground h-10 w-10 rounded-xl flex items-center justify-center disabled:opacity-40 hover:bg-primary/90 transition-colors"
                  >
                    <Send className="h-4 w-4" />
                  </motion.button>
                </form>
              </div>
            )}

            {/* ══ AUDIT LOG ══ */}
            {activeTab === "audit" && (
              <div className="p-6 space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                    <History className="h-3.5 w-3.5" /> Immutable Audit Trail
                  </p>
                  <button onClick={fetchAuditLog} className="text-xs text-primary hover:underline font-medium">Refresh</button>
                </div>
                <div className="relative">
                  <div className="absolute left-3.5 top-0 bottom-0 w-px bg-border" />
                  <div className="space-y-3">
                    {auditLog.map((entry: any, i: number) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="flex gap-4 pl-8 relative"
                      >
                        <div className={`absolute left-2 top-2 h-3 w-3 rounded-full border-2 border-background ${
                          entry.actorRole === "Admin" ? "bg-primary" : entry.actorRole === "Client" ? "bg-emerald-500" : "bg-muted-foreground"
                        }`} />
                        <div className="flex-1 bg-card border border-border rounded-xl p-3.5">
                          <p className="text-xs font-bold text-foreground">{entry.action}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                              entry.actorRole === "Admin" ? "bg-primary/10 text-primary" :
                              entry.actorRole === "Client" ? "bg-emerald-500/10 text-emerald-500" :
                              "bg-muted text-muted-foreground"
                            }`}>{entry.actorRole}</span>
                            <span className="text-[10px] text-muted-foreground">{entry.actor} · {new Date(entry.timestamp).toLocaleString()}</span>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                    {auditLog.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-10">Fetching audit log…</p>
                    )}
                  </div>
                </div>
              </div>
            )}

          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default AdminProjectHub;
