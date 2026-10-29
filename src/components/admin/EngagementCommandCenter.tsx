import { useState, useEffect } from "react";
import { ENDPOINTS, apiRequest } from "@/lib/api";
import { AdminStatusBadge } from "./AdminStatusBadge";
import { ProposalEditor } from "./ProposalEditor";
import AdminProjectHub from "./AdminProjectHub";
import {
  User, Mail, Phone, Building, Briefcase, Calendar, DollarSign,
  FileText, Lock, CreditCard, Sparkles, CheckCircle2, Clock,
  MessageSquare, ExternalLink, RefreshCw, Send, ChevronRight, X
} from "lucide-react";

interface TaskRequestItem {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  projectTitle?: string;
  service: string;
  budget?: string;
  timeline?: string;
  description: string;
  status: string;
  techStack?: string;
  proposalId?: any;
  contractToken?: string;
  contractSignedAt?: string;
  trackingToken?: string;
  statusHistory?: Array<{ status: string; updatedAt?: string; note?: string }>;
  createdAt: string;
}

interface EngagementCommandCenterProps {
  request: TaskRequestItem | null;
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

// Backend task statuses, in lifecycle order (cancelled is shown by the badge)
const STAGES = [
  { id: "new", label: "Request" },
  { id: "in_review", label: "Review" },
  { id: "proposal_sent", label: "Proposal" },
  { id: "contract_sent", label: "Contract" },
  { id: "contract_signed", label: "Signed" },
  { id: "in_progress", label: "Project" },
  { id: "completed", label: "Complete" },
];

const getStageIndex = (status: string) => Math.max(0, STAGES.findIndex((s) => s.id === status));
const isClosed = (status: string) => status === "completed" || status === "cancelled";

export const EngagementCommandCenter = ({
  request,
  isOpen,
  onClose,
  onRefresh,
}: EngagementCommandCenterProps) => {
  const [activeTab, setActiveTab] = useState<"overview" | "proposal" | "contract" | "finance" | "project">("overview");
  const [contractData, setContractData] = useState<any>(null);
  const [trackerData, setTrackerData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (request && isOpen) {
      fetchRelatedData();
    }
  }, [request, isOpen]);

  const fetchRelatedData = async () => {
    if (!request) return;
    setLoading(true);
    const [contracts, trackers] = await Promise.all([
      apiRequest<{ contracts: any[] }>(ENDPOINTS.CONTRACT_ADMIN_BY_TASK(request._id)),
      apiRequest<{ trackers: any[] }>(ENDPOINTS.TRACKER_ADMIN_LIST),
    ]);
    setContractData(contracts.data?.contracts?.[0] ?? null);
    const match = trackers.data?.trackers?.find((t: any) => t.taskRequestId === request._id || t.taskRequestId?._id === request._id);
    setTrackerData(match ?? null);
    setLoading(false);
  };

  const handleAdvanceStage = async (nextStatus: string, note = "", force = false) => {
    if (!request) return;
    setActionLoading(true);
    const { error, status } = await apiRequest(ENDPOINTS.TASK_REQUEST_UPDATE_STATUS(request._id), {
      method: "PUT",
      body: { status: nextStatus, note, ...(force && { force: true }) },
    });
    setActionLoading(false);
    // A paid invoice blocks cancellation unless the admin confirms (refunds are handled in Payments)
    if (error && status === 409 && nextStatus === "cancelled" && !force) {
      if (window.confirm(`${error}\n\nCancel anyway without refunding?`)) return handleAdvanceStage(nextStatus, note, true);
    } else if (error) window.alert(error);
    onRefresh();
    fetchRelatedData();
  };

  const handleCancel = () => {
    const reason = window.prompt("Cancel this engagement? Add a short reason for the record:");
    if (reason !== null) handleAdvanceStage("cancelled", reason || "Cancelled by admin");
  };

  if (!isOpen || !request) return null;

  const currentStageIdx = getStageIndex(request.status);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-4xl bg-card border-l border-border/60 h-full flex flex-col shadow-2xl overflow-hidden font-sans">
        {/* Workspace Top Header */}
        <div className="p-6 border-b border-border/40 space-y-4 bg-card">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono font-medium text-muted-foreground">Client Workspace</span>
                <span className="text-muted-foreground/40">•</span>
                <AdminStatusBadge status={request.status} size="sm" />
              </div>
              <h2 className="text-xl font-semibold text-foreground tracking-tight">
                {request.projectTitle || request.service}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {request.name} ({request.email}) — {request.company || "Independent Client"}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {request.status === "new" && (
                <button
                  onClick={() => handleAdvanceStage("in_review")}
                  disabled={actionLoading}
                  className="px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold shadow-xs hover:bg-primary/90 transition-all"
                >
                  Mark In Review
                </button>
              )}
              {request.status === "in_review" && (
                <button
                  onClick={() => setActiveTab("proposal")}
                  className="px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold shadow-xs hover:bg-primary/90 transition-all flex items-center gap-1.5"
                >
                  <Sparkles className="h-3.5 w-3.5" /> Prepare Proposal
                </button>
              )}
              {!isClosed(request.status) && (
                <button
                  onClick={handleCancel}
                  disabled={actionLoading}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-destructive hover:bg-destructive/10 transition-all"
                >
                  Cancel engagement
                </button>
              )}
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Minimal Lifecycle Step Breadcrumbs */}
          <div className="pt-2">
            <div className="flex items-center justify-between overflow-x-auto pb-1">
              {STAGES.map((s, idx) => {
                const isPassed = idx < currentStageIdx;
                const isCurrent = idx === currentStageIdx;
                return (
                  <div key={s.id} className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <div
                        className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-mono font-bold transition-all ${
                          isPassed
                            ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                            : isCurrent
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {isPassed ? "✓" : idx + 1}
                      </div>
                      <span
                        className={`text-xs font-medium ${
                          isCurrent
                            ? "text-foreground font-semibold"
                            : isPassed
                            ? "text-muted-foreground"
                            : "text-muted-foreground/60"
                        }`}
                      >
                        {s.label}
                      </span>
                    </div>
                    {idx < STAGES.length - 1 && (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tab Selection Navigation */}
          <div className="flex items-center gap-2 border-t border-border/40 pt-3">
            {[
              { id: "overview", label: "Overview & Brief" },
              { id: "proposal", label: "AI Proposal" },
              { id: "contract", label: "Contract" },
              { id: "finance", label: "Finance & Invoices" },
              { id: "project", label: "Project Workspace" },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTab === t.id
                    ? "bg-muted text-foreground font-semibold shadow-xs"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content Panel */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-background">
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* Client & Project Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-border/40">
                <div className="space-y-2">
                  <span className="text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wider block">
                    Client Details
                  </span>
                  <div className="space-y-1 text-xs">
                    <p className="font-semibold text-foreground">{request.name}</p>
                    <p className="text-muted-foreground">{request.email}</p>
                    <p className="text-muted-foreground">{request.phone || "No phone provided"}</p>
                    <p className="text-muted-foreground">{request.company || "Independent Client"}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wider block">
                    Project Parameters
                  </span>
                  <div className="space-y-1 text-xs">
                    <p className="text-foreground">
                      <span className="text-muted-foreground">Service:</span> {request.service}
                    </p>
                    <p className="text-foreground">
                      <span className="text-muted-foreground">Budget:</span> {request.budget || "TBD"}
                    </p>
                    <p className="text-foreground">
                      <span className="text-muted-foreground">Timeline:</span> {request.timeline || "Flexible"}
                    </p>
                    <p className="text-foreground">
                      <span className="text-muted-foreground">Submitted:</span>{" "}
                      {new Date(request.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>

              {/* Requirement Description */}
              <div className="space-y-2">
                <span className="text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wider block">
                  Project Brief & Requirements
                </span>
                <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">
                  {request.description}
                </p>
              </div>

              {request.techStack && (
                <div className="space-y-2 pt-4 border-t border-border/40">
                  <span className="text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wider block">
                    Preferred Tech Stack
                  </span>
                  <p className="text-xs font-mono text-foreground">{request.techStack}</p>
                </div>
              )}
            </div>
          )}

          {activeTab === "proposal" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-border/40">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">AI Proposal Generation</h3>
                  <p className="text-xs text-muted-foreground">Draft or inspect client proposal document</p>
                </div>
              </div>

              <ProposalEditor
                taskId={request._id}
                clientEmail={request.email}
                clientName={request.name}
                onChanged={() => {
                  onRefresh();
                  fetchRelatedData();
                }}
              />
            </div>
          )}

          {activeTab === "contract" && (
            <div className="space-y-4">
              <div className="pb-3 border-b border-border/40">
                <h3 className="text-sm font-semibold text-foreground">Service Agreement Contract</h3>
                <p className="text-xs text-muted-foreground">Digital signature state and execution history</p>
              </div>

              {contractData ? (
                <div className="p-4 rounded-xl border border-border/60 bg-card space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground">Client Legal Contract</span>
                    <AdminStatusBadge status={contractData.status} size="sm" />
                  </div>
                  <p className="text-muted-foreground font-mono">Token: {contractData.contractToken}</p>
                  {contractData.signedAt && (
                    <p className="text-emerald-500 font-semibold">
                      Signed on {new Date(contractData.signedAt).toLocaleString()}
                    </p>
                  )}
                </div>
              ) : (
                <div className="py-8 text-center space-y-2">
                  <p className="text-xs text-muted-foreground">Contract will be issued after proposal acceptance.</p>
                </div>
              )}
            </div>
          )}

          {activeTab === "finance" && (
            <div className="space-y-4">
              <div className="pb-3 border-b border-border/40">
                <h3 className="text-sm font-semibold text-foreground">Financial Status & Invoices</h3>
                <p className="text-xs text-muted-foreground">Stripe transactions and billing records</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Invoices linked to this engagement can be created or issued directly via the Finance workspace.
              </p>
            </div>
          )}

          {activeTab === "project" && (
            <div className="space-y-4">
              <div className="pb-3 border-b border-border/40">
                <h3 className="text-sm font-semibold text-foreground">Active Project Tracker</h3>
                <p className="text-xs text-muted-foreground">Development phases, deliverables, and client updates</p>
              </div>

              {["contract_signed", "in_progress", "completed"].includes(request.status) || trackerData ? (
                <AdminProjectHub taskId={request._id} />
              ) : (
                <div className="py-8 text-center space-y-2">
                  <p className="text-xs text-muted-foreground">Project tracker activates once the contract is signed.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EngagementCommandCenter;
