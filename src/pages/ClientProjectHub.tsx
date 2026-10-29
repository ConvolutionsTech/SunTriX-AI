import { useState, useEffect, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { apiRequest, ENDPOINTS } from "../lib/api";
import {
  CheckCircle2, Clock, FileText, MessageSquare, Send, CreditCard,
  ExternalLink, XCircle, CheckCircle, AlertCircle, Download, Package,
  RefreshCw, ThumbsUp, ThumbsDown, Bell
} from "lucide-react";
import Layout from "../components/Layout";
import { toast } from "react-hot-toast";
import { safeHref } from "@/lib/sanitize";

const phases = ["Discovery", "Design", "Development", "Testing", "Delivery"];

const ClientProjectHub = () => {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const [tracker, setTracker] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chatMessage, setChatMessage] = useState("");
  const [sendingChat, setSendingChat] = useState(false);
  const [payingMilestone, setPayingMilestone] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "deliverables" | "files" | "updates" | "chat">("overview");

  const fetchTracker = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data, error: apiError } = await apiRequest<any>(ENDPOINTS.TRACKER_CLIENT_BY_TOKEN(token!));
      if (apiError || !data?.tracker) {
        if (!silent) setError("Invalid tracking link or project not found.");
      } else {
        setTracker(data.tracker);
      }
    } catch {
      if (!silent) setError("An error occurred while fetching your project status.");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchTracker();
    // Polling for chat & live updates
    const interval = setInterval(() => { if (token) fetchTracker(true); }, 8000);
    return () => clearInterval(interval);
  }, [token]);

  // Show paid toast if redirected from Stripe
  useEffect(() => {
    if (searchParams.get("paid") === "1") {
      toast.success("🎉 Payment confirmed! Your project is moving forward.");
    }
  }, []);

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [tracker?.messages]);

  const handleApproveDeliverable = async (dId: string) => {
    const { error } = await apiRequest(ENDPOINTS.TRACKER_CLIENT_DELIVERABLE_APPROVE(token!, dId), { method: "POST" });
    if (error) return toast.error("Failed to approve.");
    toast.success("✅ Deliverable approved!");
    fetchTracker(true);
  };

  const handleRejectDeliverable = async (dId: string) => {
    const note = prompt("Please describe what changes you need:");
    if (!note) return;
    const { error } = await apiRequest(ENDPOINTS.TRACKER_CLIENT_DELIVERABLE_REJECT(token!, dId), { method: "POST", body: { clientRejectionNote: note } });
    if (error) return toast.error("Failed to request changes.");
    toast.success("Changes requested. We'll get right on it!");
    fetchTracker(true);
  };

  const handleApproveFile = async (fId: string) => {
    const { error } = await apiRequest(ENDPOINTS.TRACKER_CLIENT_FILE_APPROVE(token!, fId), { method: "POST" });
    if (error) return toast.error("Failed to approve file.");
    toast.success("File approved!");
    fetchTracker(true);
  };

  const handleRejectFile = async (fId: string) => {
    const comment = prompt("What changes are needed for this file?");
    if (!comment) return;
    const { error } = await apiRequest(ENDPOINTS.TRACKER_CLIENT_FILE_REJECT(token!, fId), { method: "POST", body: { clientComment: comment } });
    if (error) return toast.error("Failed to reject file.");
    toast.success("Feedback submitted.");
    fetchTracker(true);
  };

  const handleAcknowledgeUpdate = async (uId: string) => {
    const { error } = await apiRequest(ENDPOINTS.TRACKER_CLIENT_UPDATE_ACK(token!, uId), { method: "POST" });
    if (error) return toast.error("Failed to acknowledge.");
    toast.success("Update acknowledged!");
    fetchTracker(true);
  };

  const handlePayMilestone = async (mId: string) => {
    setPayingMilestone(mId);
    const { data, error } = await apiRequest<any>(ENDPOINTS.TRACKER_CLIENT_MILESTONE_CHECKOUT(token!, mId), { method: "POST" });
    setPayingMilestone(null);
    if (error) return toast.error("Failed to initiate payment. Please try again.");
    if (data?.alreadyPaid) return toast.success("This milestone is already paid!");
    if (data?.checkoutUrl) window.location.href = data.checkoutUrl;
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim()) return;
    setSendingChat(true);
    const msg = chatMessage;
    setChatMessage("");

    // Optimistic update
    setTracker((prev: any) => prev ? {
      ...prev,
      messages: [...(prev.messages || []), { sender: "Client", text: msg, sentAt: new Date().toISOString() }]
    } : prev);

    const { error } = await apiRequest(ENDPOINTS.TRACKER_CLIENT_CHAT(token!), { method: "POST", body: { text: msg } });
    setSendingChat(false);
    if (error) { toast.error("Failed to send message."); fetchTracker(true); }
  };

  const [approvingCompletion, setApprovingCompletion] = useState(false);
  const handleApproveCompletion = async () => {
    if (!confirm("Are you sure you want to approve this project as fully complete? This action is final.")) return;
    setApprovingCompletion(true);
    const { error } = await apiRequest(ENDPOINTS.TRACKER_CLIENT_COMPLETION_APPROVE(token!), { method: "POST" });
    setApprovingCompletion(false);
    if (error) return toast.error("Failed to approve completion. Please try again.");
    toast.success("Project marked as completed! Thank you!");
    fetchTracker(true);
  };

  // ─── Loading State ───────────────────────────────────────────────
  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen pt-32 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary" />
            <p className="text-muted-foreground">Loading your project hub…</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !tracker) {
    return (
      <Layout>
        <div className="min-h-screen pt-32 flex items-center justify-center px-4">
          <div className="max-w-md w-full bg-card rounded-2xl p-8 border border-border text-center shadow-xl">
            <XCircle className="h-16 w-16 text-destructive mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-foreground mb-2">Link Invalid or Expired</h2>
            <p className="text-muted-foreground">We couldn't find a project with this link. Please contact your project manager.</p>
          </div>
        </div>
      </Layout>
    );
  }

  const currentPhaseIdx = phases.indexOf(tracker.currentPhase);
  const approvedDeliverables = tracker.deliverables?.filter((d: any) => d.status === "Approved").length || 0;
  const paidMilestones = tracker.milestones?.filter((m: any) => m.paidAt).length || 0;
  const pendingMilestone = tracker.milestones?.find((m: any) => !m.paidAt);
  const unreadUpdates = tracker.updates?.filter((u: any) => !u.clientAcknowledgedAt).length || 0;

  const TABS = [
    { id: "overview", label: "Overview" },
    { id: "deliverables", label: `Deliverables${tracker.deliverables?.length ? ` (${tracker.deliverables.length})` : ""}` },
    { id: "files", label: `Files${tracker.files?.length ? ` (${tracker.files.length})` : ""}` },
    { id: "updates", label: `Updates${unreadUpdates > 0 ? ` 🔴` : ""}` },
    { id: "chat", label: "Chat" },
  ];

  return (
    <Layout>
      <div className="min-h-screen pt-20 pb-24 bg-background">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 pt-6">

          {/* ── Header ── */}
          <div className="bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-1">Your Project Hub</p>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">{tracker.taskRequestId?.projectTitle || "Project Tracker"}</h1>
              <p className="text-muted-foreground mt-1 text-sm">Logged in as: {tracker.taskRequestId?.name || "Client"}</p>
            </div>
            <div className="flex flex-col items-start md:items-end gap-2">
              <span className="bg-primary text-primary-foreground text-sm px-4 py-1.5 rounded-full font-semibold">
                Phase: {tracker.currentPhase}
              </span>
              <button onClick={() => fetchTracker(true)} className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors">
                <RefreshCw className="h-3 w-3" /> Refresh
              </button>
            </div>
          </div>

          {/* ── Approval Banner ── */}
          {tracker.completionRequestedAt && !tracker.completionApprovedAt && (
            <div className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/30 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 shadow-lg shadow-emerald-500/5">
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                  <span className="text-2xl">🎉</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">Project Ready for Sign-Off!</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    The team has completed all deliverables and is requesting your final approval. Please review everything and click approve to officially close the project.
                  </p>
                </div>
              </div>
              <button
                onClick={handleApproveCompletion}
                disabled={approvingCompletion}
                className="shrink-0 w-full md:w-auto bg-gradient-to-r from-emerald-500 to-teal-600 text-white px-8 py-3 rounded-xl font-bold shadow-md hover:shadow-lg hover:shadow-emerald-500/30 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {approvingCompletion ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white" />
                    Approving...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-5 w-5" />
                    Approve & Complete Project
                  </>
                )}
              </button>
            </div>
          )}
          
          {tracker.completionApprovedAt && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 flex items-center justify-center gap-3">
              <CheckCircle className="h-6 w-6 text-emerald-500" />
              <p className="text-emerald-500 font-bold">This project has been officially completed and approved!</p>
            </div>
          )}

          {/* ── Phase Stepper ── */}
          <div className="bg-card border border-border rounded-2xl p-6">
            <div className="relative flex items-center justify-between">
              <div className="absolute inset-x-0 top-5 h-0.5 bg-muted mx-8 hidden md:block" />
              {phases.map((phase, idx) => {
                const done = idx < currentPhaseIdx;
                const active = idx === currentPhaseIdx;
                return (
                  <div key={phase} className="flex flex-col items-center gap-2 relative z-10 bg-card px-2">
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center border-2 font-bold text-sm transition-all ${
                      done   ? "bg-primary border-primary text-white" :
                      active ? "bg-background border-primary text-primary ring-4 ring-primary/20" :
                               "bg-background border-muted text-muted-foreground"
                    }`}>
                      {done ? <CheckCircle2 className="h-5 w-5" /> : idx + 1}
                    </div>
                    <span className={`text-xs font-medium hidden sm:block ${active ? "text-primary" : done ? "text-foreground" : "text-muted-foreground"}`}>
                      {phase}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Summary Cards ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Deliverables Done", value: `${approvedDeliverables}/${tracker.deliverables?.length || 0}`, icon: CheckCircle, color: "text-green-500" },
              { label: "Milestones Paid", value: `${paidMilestones}/${tracker.milestones?.length || 0}`, icon: CreditCard, color: "text-blue-500" },
              { label: "Files Shared", value: tracker.files?.length || 0, icon: FileText, color: "text-purple-500" },
              { label: "Unread Updates", value: unreadUpdates, icon: Bell, color: "text-amber-500" },
            ].map(card => (
              <div key={card.label} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
                <card.icon className={`h-8 w-8 shrink-0 ${card.color}`} />
                <div>
                  <p className="text-2xl font-bold text-foreground">{card.value}</p>
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* ── Pending payment banner ── */}
          {pendingMilestone && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
                <div>
                  <p className="font-semibold text-foreground text-sm">Payment Due: {pendingMilestone.title}</p>
                  <p className="text-xs text-muted-foreground">${(pendingMilestone.amount / 100).toFixed(2)} — Due {new Date(pendingMilestone.dueDate).toLocaleDateString()}</p>
                </div>
              </div>
              <button
                onClick={() => handlePayMilestone(pendingMilestone._id)}
                disabled={payingMilestone === pendingMilestone._id}
                className="bg-amber-500 hover:bg-amber-600 text-white px-5 py-2 rounded-lg font-bold text-sm transition-colors shrink-0 disabled:opacity-70"
              >
                {payingMilestone === pendingMilestone._id ? "Loading…" : "Pay Now →"}
              </button>
            </div>
          )}

          {/* ── Tabs ── */}
          <div className="flex overflow-x-auto gap-1 border-b border-border pb-0">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap border-b-2 -mb-px ${
                  activeTab === tab.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ══ OVERVIEW TAB ══ */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              <div className="bg-card border border-border rounded-xl p-6">
                <h2 className="font-bold text-foreground mb-4">Recent Updates</h2>
                {tracker.updates?.length === 0 && <p className="text-muted-foreground text-sm">No updates yet — we'll notify you when there's news!</p>}
                <div className="space-y-4">
                  {tracker.updates?.slice(0, 3).map((u: any) => {
                    const colors: any = { ProgressUpdate: "bg-blue-500/10 text-blue-500", Blocker: "bg-red-500/10 text-red-500", MilestoneReached: "bg-green-500/10 text-green-500", ActionRequired: "bg-amber-500/10 text-amber-500" };
                    return (
                      <div key={u._id} className="flex gap-4">
                        <div className="flex-1 border-l-2 border-primary/30 pl-4">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${colors[u.type] || "bg-muted text-muted-foreground"}`}>{u.type}</span>
                            <span className="text-xs text-muted-foreground">{new Date(u.postedAt).toLocaleDateString()}</span>
                          </div>
                          <p className="text-sm text-foreground">{u.body}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ══ DELIVERABLES TAB ══ */}
          {activeTab === "deliverables" && (
            <div className="space-y-4">
              {tracker.deliverables?.length === 0 && (
                <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
                  <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p>Deliverables will appear here as work progresses.</p>
                </div>
              )}
              {tracker.deliverables?.map((d: any) => (
                <div key={d._id} className="bg-card border border-border rounded-xl p-5 flex flex-col sm:flex-row justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-foreground">{d.title}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        d.status === "Approved"  ? "bg-green-500/10 text-green-500" :
                        d.status === "Rejected"  ? "bg-red-500/10 text-red-500" :
                        d.status === "InReview"  ? "bg-amber-500/10 text-amber-500" :
                                                   "bg-muted text-muted-foreground"
                      }`}>{d.status === "InReview" ? "⏳ Awaiting Review" : d.status}</span>
                      <span className="text-xs text-muted-foreground">v{d.version}</span>
                    </div>
                    {d.clientRejectionNote && (
                      <div className="bg-red-500/10 border border-red-500/20 text-red-600 text-xs p-2 rounded-lg mt-2">
                        <strong>Your request:</strong> {d.clientRejectionNote}
                      </div>
                    )}
                    {d.clientApprovedAt && (
                      <p className="text-xs text-green-500 mt-1">✅ You approved this on {new Date(d.clientApprovedAt).toLocaleDateString()}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {d.attachedUrl && (
                      <a href={safeHref(d.attachedUrl)} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1 text-sm text-primary hover:underline border border-primary/30 px-3 py-1.5 rounded-lg">
                        <ExternalLink className="h-3.5 w-3.5" /> View Work
                      </a>
                    )}
                    {d.status === "InReview" && (
                      <div className="flex gap-2">
                        <button onClick={() => handleApproveDeliverable(d._id)}
                          className="flex items-center gap-1 bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold transition-colors">
                          <ThumbsUp className="h-3.5 w-3.5" /> Approve
                        </button>
                        <button onClick={() => handleRejectDeliverable(d._id)}
                          className="flex items-center gap-1 bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold transition-colors">
                          <ThumbsDown className="h-3.5 w-3.5" /> Changes
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ══ FILES TAB ══ */}
          {activeTab === "files" && (
            <div className="space-y-4">
              {tracker.files?.length === 0 && (
                <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
                  <Download className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p>No files have been shared yet.</p>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {tracker.files?.map((f: any) => (
                  <div key={f._id} className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-sm text-foreground">{f.filename}</p>
                        <p className="text-xs text-muted-foreground">{new Date(f.uploadedAt).toLocaleDateString()}</p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                        f.approvalStatus === "Approved" ? "bg-green-500/10 text-green-500" :
                        f.approvalStatus === "Rejected" ? "bg-red-500/10 text-red-500" :
                                                          "bg-amber-500/10 text-amber-500"
                      }`}>{f.approvalStatus}</span>
                    </div>
                    {f.clientComment && (
                      <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded-lg italic">"{f.clientComment}"</p>
                    )}
                    <div className="flex items-center gap-2">
                      <a href={safeHref(f.cloudinaryUrl)} target="_blank" rel="noreferrer"
                        className="flex-1 text-center text-xs text-primary border border-primary/30 rounded-lg px-3 py-1.5 hover:bg-primary/5">
                        View / Download
                      </a>
                      {f.approvalStatus === "Pending" && (
                        <>
                          <button onClick={() => handleApproveFile(f._id)} className="bg-green-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-green-600">✓</button>
                          <button onClick={() => handleRejectFile(f._id)} className="bg-red-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-600">✗</button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══ UPDATES TAB ══ */}
          {activeTab === "updates" && (
            <div className="space-y-4">
              {tracker.updates?.length === 0 && (
                <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
                  <Bell className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p>No updates posted yet.</p>
                </div>
              )}
              {tracker.updates?.map((u: any) => {
                const colors: any = {
                  ProgressUpdate: { bg: "border-blue-500/40", badge: "bg-blue-500/10 text-blue-500" },
                  Blocker:        { bg: "border-red-500/40",  badge: "bg-red-500/10 text-red-500" },
                  MilestoneReached: { bg: "border-green-500/40", badge: "bg-green-500/10 text-green-500" },
                  ActionRequired: { bg: "border-amber-500/40", badge: "bg-amber-500/10 text-amber-500" },
                };
                const style = colors[u.type] || { bg: "border-border", badge: "bg-muted text-muted-foreground" };
                return (
                  <div key={u._id} className={`bg-card border-l-4 border rounded-xl p-5 ${style.bg}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${style.badge}`}>{u.type}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">{new Date(u.postedAt).toLocaleString()}</span>
                        {u.clientAcknowledgedAt ? (
                          <span className="text-xs text-green-500 font-medium">✓ Acknowledged</span>
                        ) : (
                          <button onClick={() => handleAcknowledgeUpdate(u._id)}
                            className="text-xs bg-primary/10 text-primary hover:bg-primary hover:text-white px-3 py-1 rounded-full font-medium transition-colors">
                            Acknowledge
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-foreground">{u.body}</p>
                    {u.nextUpdateDue && (
                      <p className="text-xs text-muted-foreground mt-2">Next update by: {new Date(u.nextUpdateDue).toLocaleDateString()}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ══ CHAT TAB ══ */}
          {activeTab === "chat" && (
            <div className="bg-card border border-border rounded-xl flex flex-col" style={{ height: "500px" }}>
              <div className="p-4 border-b border-border flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                <span className="font-semibold text-foreground">Direct Messages</span>
                <span className="text-xs text-muted-foreground ml-auto">Messages are private between you and the team.</span>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {!tracker.messages?.length && (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                    Start the conversation! Ask us anything about your project.
                  </div>
                )}
                {tracker.messages?.map((msg: any, i: number) => {
                  const isClient = msg.sender === "Client";
                  return (
                    <div key={i} className={`flex flex-col max-w-[75%] ${isClient ? "self-end items-end ml-auto" : "self-start items-start"}`}>
                      <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                        isClient ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm"
                      }`}>
                        {msg.text}
                      </div>
                      <span className="text-[10px] text-muted-foreground mt-1">
                        {new Date(msg.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>

              <form onSubmit={handleSendChat} className="p-4 border-t border-border flex gap-2">
                <input
                  type="text"
                  value={chatMessage}
                  onChange={e => setChatMessage(e.target.value)}
                  placeholder="Type a message to the team..."
                  className="flex-1 bg-muted border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  type="submit"
                  disabled={!chatMessage.trim() || sendingChat}
                  className="bg-primary text-white p-2.5 rounded-xl disabled:opacity-50 hover:bg-primary/90 transition-colors"
                >
                  <Send className="h-5 w-5" />
                </button>
              </form>
            </div>
          )}

          {/* ── Milestones table always visible at bottom ── */}
          {tracker.milestones?.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-6">
              <h2 className="font-bold text-foreground mb-4 flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" /> Payment Schedule
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground uppercase">
                    <tr>
                      <th className="px-4 py-3 text-left rounded-l-lg">Milestone</th>
                      <th className="px-4 py-3 text-left">Amount</th>
                      <th className="px-4 py-3 text-left">Due Date</th>
                      <th className="px-4 py-3 text-left rounded-r-lg">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {tracker.milestones.map((m: any) => (
                      <tr key={m._id}>
                        <td className="px-4 py-3 font-medium text-foreground">{m.title}</td>
                        <td className="px-4 py-3 font-bold">${(m.amount / 100).toFixed(2)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{new Date(m.dueDate).toLocaleDateString()}</td>
                        <td className="px-4 py-3">
                          {m.paidAt ? (
                            <span className="inline-flex items-center gap-1 text-green-500 bg-green-500/10 px-3 py-1 rounded-full text-xs font-bold">
                              <CheckCircle className="h-3.5 w-3.5" /> Paid
                            </span>
                          ) : (
                            <button
                              onClick={() => handlePayMilestone(m._id)}
                              disabled={payingMilestone === m._id}
                              className="bg-primary text-primary-foreground px-4 py-1.5 rounded-lg text-xs font-bold hover:opacity-90 transition-opacity disabled:opacity-60"
                            >
                              {payingMilestone === m._id ? "Loading…" : "Pay Now"}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      </div>
    </Layout>
  );
};

export default ClientProjectHub;
