import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, CheckCircle, Clock, AlertTriangle, Loader2,
  ChevronRight, ChevronDown, ChevronUp, MessageSquare, ArrowRight,
} from "lucide-react";
import { apiRequest, ENDPOINTS } from "@/lib/api";
import { useCompanyInfo } from "@/hooks/useCompanyInfo";

interface Milestone {
  title: string;
  description: string;
  amount: number;  // cents
  dueWeek: number;
  order: number;
}

interface Proposal {
  _id: string;
  proposalToken: string;
  title: string;
  
  executiveSummary?: string;
  scopeOfWork?: string;
  deliverables?: string;
  pricingBreakdown?: string;
  revisionsPolicy?: string;
  clientResponsibilities?: string;
  supportAndWarranty?: string;
  paymentTerms?: string;
  nextSteps?: string;

  // Fallbacks
  introduction?: string;
  scopeItems?: string[];
  terms?: string;

  timeline: string;
  totalAmount: number;
  currency: string;
  milestones: Milestone[];
  status: "draft" | "sent" | "accepted" | "changes_requested" | "rejected";
  clientName: string;
  clientEmail: string;
  expiresAt: string;
  acceptedAt?: string;
  /** Set once accepted — links to the generated contract */
  contractToken?: string;
  clientNote?: string;
  taskRequestId?: {
    projectTitle: string;
    service: string;
    selectedPlan: string;
  };
}

const fmt = (cents: number, currency = "usd") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);

const ClientProposal = () => {
  const { token } = useParams<{ token: string }>();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<"view" | "accepting" | "accepted" | "changes" | "changes_submitted">("view");
  const [contractToken, setContractToken] = useState("");
  const [changeNote, setChangeNote] = useState("");
  const [submittingChange, setSubmittingChange] = useState(false);
  const [showFullTerms, setShowFullTerms] = useState(false);
  const companyName = useCompanyInfo().name || "SunTriX AI Solutions";

  useEffect(() => {
    if (!token) { setError("Invalid proposal link."); setLoading(false); return; }
    
    const fetchProposal = async () => {
        const { data, error: err } = await apiRequest<Proposal>(ENDPOINTS.PROPOSAL_BY_TOKEN(token));
        if (err || !data) setError(err || "Proposal not found.");
        else {
          setProposal(data);
          if (data.status === "accepted") {
            setPhase("accepted");
            setContractToken(data.contractToken || sessionStorage.getItem(`contract-for-${token}`) || "");
          }
          if (data.status === "changes_requested") setPhase("changes_submitted");
        }
    };
    
    fetchProposal().finally(() => setLoading(false));
  }, [token]);

  const handleAccept = async () => {
    if (!token) return;
    setPhase("accepting");
    const { data, error: err } = await apiRequest<{ contractToken: string; contractUrl: string }>(
      ENDPOINTS.PROPOSAL_ACCEPT(token),
      { method: "POST" }
    );
    if (err || !data) {
      setError(err || "Failed to accept proposal. Please try again.");
      setPhase("view");
    } else {
      setContractToken(data.contractToken);
      // Keep the "Review & Sign" link if the client refreshes this page
      try {
        sessionStorage.setItem(`contract-for-${token}`, data.contractToken);
      } catch {
        // Storage unavailable — the link still comes from the proposal once accepted
      }
      setPhase("accepted");
    }
  };

  const handleRequestChanges = async () => {
    if (!changeNote.trim()) return;
    setSubmittingChange(true);
    const { error: err } = await apiRequest(
      ENDPOINTS.PROPOSAL_REQUEST_CHANGES(token!),
      { method: "POST", body: { clientNote: changeNote } }
    );
    setSubmittingChange(false);
    if (!err) setPhase("changes_submitted");
    else setError(err);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="rounded-2xl border border-destructive/30 bg-card p-8 text-center max-w-md">
        <AlertTriangle className="h-10 w-10 text-destructive mx-auto mb-4" />
        <p className="text-destructive font-semibold mb-2">Proposal Unavailable</p>
        <p className="text-sm text-muted-foreground mb-6">{error}</p>
        <Link to="/contact" className="text-primary text-sm underline">Contact Support</Link>
      </div>
    </div>
  );

  if (!proposal) return null;

  // ── Accepted State ──────────────────────────────────────────────
  if (phase === "accepted" || proposal.status === "accepted") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4 py-16">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-lg w-full text-center">
          <div className="rounded-2xl border border-emerald-500/30 bg-card p-10 shadow-xl">
            <div className="h-20 w-20 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="h-10 w-10 text-emerald-500" />
            </div>
            <h1 className="text-2xl font-extrabold text-foreground mb-3">Proposal Accepted!</h1>
            <p className="text-muted-foreground mb-6">
              Excellent! Your service agreement has been generated and sent to your email.
              Please check your inbox to review and sign the contract.
            </p>
            {contractToken && (
              <Link
                to={`/contract/${contractToken}`}
                className="inline-flex items-center gap-2 gradient-bg rounded-xl px-8 py-4 text-sm font-bold text-primary-foreground hover:opacity-90 transition-opacity shadow-lg shadow-primary/20"
              >
                Review & Sign Contract <ArrowRight className="h-4 w-4" />
              </Link>
            )}
            <p className="text-xs text-muted-foreground mt-4">Can't find the email? Check your spam folder.</p>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Changes Submitted State ──────────────────────────────────────────────
  if (phase === "changes_submitted" || proposal.status === "changes_requested") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4 py-16">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-lg w-full text-center">
          <div className="rounded-2xl border border-amber-500/30 bg-card p-10 shadow-xl">
            <div className="h-20 w-20 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-6">
              <MessageSquare className="h-10 w-10 text-amber-500" />
            </div>
            <h1 className="text-2xl font-extrabold text-foreground mb-3">Changes Requested</h1>
            <p className="text-muted-foreground mb-4">
              We've received your feedback. Our team will review your requests and send a revised proposal shortly.
            </p>
            {proposal.clientNote && (
              <div className="bg-muted/30 rounded-xl p-4 border border-border text-left mb-4">
                <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider font-semibold">Your Requested Changes</p>
                <p className="text-sm text-foreground">{proposal.clientNote}</p>
              </div>
            )}
            <Link to="/contact" className="text-primary text-sm underline">Questions? Contact Us</Link>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Main Proposal View ──────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background px-4 py-16">
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="h-12 w-12 rounded-xl gradient-bg flex items-center justify-center shadow-lg">
            <FileText className="h-6 w-6 text-white" />
          </div>
          <div>
            <p className="text-xs font-mono text-primary uppercase tracking-widest">{companyName}</p>
            <h1 className="text-xl font-extrabold text-foreground">Project Proposal</h1>
          </div>
        </div>

        {/* Expiry Banner */}
        {proposal.expiresAt && new Date(proposal.expiresAt) > new Date() && (
          <div className="mb-6 bg-amber-500/10 border border-amber-500/20 rounded-xl px-5 py-3 flex items-center gap-3">
            <Clock className="h-4 w-4 text-amber-500 shrink-0" />
            <p className="text-sm text-amber-500">
              This proposal expires on <strong>{new Date(proposal.expiresAt).toLocaleDateString("en-US", { dateStyle: "long" })}</strong>
            </p>
          </div>
        )}

        <div className="rounded-2xl border border-border bg-card shadow-xl overflow-hidden">
          <div className="gradient-bg px-8 py-6">
            <h2 className="text-2xl font-extrabold text-white mb-1">{proposal.title}</h2>
            <p className="text-white/70 text-sm">Prepared for {proposal.clientName}</p>
            {proposal.taskRequestId?.selectedPlan && (
              <span className="inline-block mt-2 text-xs bg-white/20 text-white px-3 py-1 rounded-full font-medium">
                {proposal.taskRequestId.selectedPlan}
              </span>
            )}
          </div>

          <div className="p-8 space-y-8">
            {/* Executive Summary (Fallback to intro) */}
            {(proposal.executiveSummary || proposal.introduction) && (
              <div>
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-3">1. Executive Summary</h3>
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {proposal.executiveSummary || proposal.introduction}
                </p>
              </div>
            )}

            {/* Scope of Work */}
            {proposal.scopeOfWork && (
              <div>
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-3">2. Scope of Work</h3>
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{proposal.scopeOfWork}</p>
              </div>
            )}

            {/* Deliverables (Fallback to scopeItems array) */}
            {(proposal.deliverables || (proposal.scopeItems && proposal.scopeItems.length > 0)) && (
              <div>
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-3">3. Deliverables</h3>
                {proposal.deliverables ? (
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{proposal.deliverables}</p>
                ) : (
                  <ul className="space-y-2">
                    {proposal.scopeItems?.map((item, i) => (
                      <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                        <ChevronRight className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Timeline */}
            {proposal.timeline && (
              <div>
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-2">4. Timeline</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{proposal.timeline}</p>
              </div>
            )}

            {/* Payment Milestones */}
            {proposal.milestones?.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-3">5. Milestones</h3>
                <div className="space-y-3">
                  {proposal.milestones.map((m, i) => (
                    <div key={i} className="rounded-xl border border-border bg-muted/20 p-4">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-semibold text-foreground">
                          <span className="text-primary mr-2">#{i + 1}</span>{m.title}
                        </p>
                        <p className="text-sm font-extrabold text-primary">{fmt(m.amount, proposal.currency)}</p>
                      </div>
                      {m.description && <p className="text-xs text-muted-foreground">{m.description}</p>}
                      {m.dueWeek > 0 && <p className="text-xs text-muted-foreground mt-1">Due: Week {m.dueWeek}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pricing Breakdown */}
            {proposal.pricingBreakdown && (
              <div>
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-2">6. Pricing Breakdown</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{proposal.pricingBreakdown}</p>
              </div>
            )}

            {/* Total */}
            <div className="rounded-xl bg-muted/30 p-4 flex items-center justify-between border border-border">
              <span className="text-sm text-muted-foreground">Total Investment</span>
              <span className="text-2xl font-extrabold gradient-text">{fmt(proposal.totalAmount, proposal.currency)}</span>
            </div>

            {/* Revisions Policy */}
            {proposal.revisionsPolicy && (
              <div>
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-2">7. Revisions Policy</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{proposal.revisionsPolicy}</p>
              </div>
            )}

            {/* Client Responsibilities */}
            {proposal.clientResponsibilities && (
              <div>
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-2">8. Client Responsibilities</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{proposal.clientResponsibilities}</p>
              </div>
            )}

            {/* Support & Warranty */}
            {proposal.supportAndWarranty && (
              <div>
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-2">9. Support & Warranty</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{proposal.supportAndWarranty}</p>
              </div>
            )}

            {/* Payment Terms */}
            {proposal.paymentTerms && (
              <div>
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-2">10. Payment Terms</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{proposal.paymentTerms}</p>
              </div>
            )}

            {/* Next Steps */}
            {proposal.nextSteps && (
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-6">
                <h3 className="text-sm font-bold text-primary uppercase tracking-wider mb-2">11. Next Steps</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{proposal.nextSteps}</p>
              </div>
            )}

            {/* Legacy Terms (Fallback) */}
            {proposal.terms && (
              <div>
                <button
                  onClick={() => setShowFullTerms(!showFullTerms)}
                  className="flex items-center gap-2 text-sm font-bold text-foreground uppercase tracking-wider mb-2 hover:text-primary transition-colors"
                >
                  Legacy Terms & Conditions
                  {showFullTerms ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                <AnimatePresence>
                  {showFullTerms && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      <p className="text-xs text-muted-foreground leading-relaxed bg-muted/30 rounded-xl p-4 border border-border whitespace-pre-wrap">
                        {proposal.terms}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Actions */}
            {phase === "view" && (
              <div className="space-y-4 pt-2">
                <button
                  id="proposal-accept-btn"
                  onClick={handleAccept}
                  className="w-full gradient-bg rounded-xl py-4 font-bold text-primary-foreground hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20 text-sm"
                >
                  <CheckCircle className="h-4 w-4" /> Accept Proposal & Proceed to Contract
                </button>
                <button
                  id="proposal-changes-btn"
                  onClick={() => setPhase("changes")}
                  className="w-full rounded-xl border border-border py-3 text-sm font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
                >
                  Request Changes
                </button>
                <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
                  By clicking "Accept Proposal", you agree to the payment milestones and terms outlined above.
                  A service agreement will be generated for your digital signature.
                </p>
              </div>
            )}

            {phase === "accepting" && (
              <div className="text-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Generating your service agreement…</p>
              </div>
            )}

            {/* Request Changes Form */}
            <AnimatePresence>
              {phase === "changes" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-4 pt-2"
                >
                  <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
                    <p className="text-sm font-semibold text-amber-500 mb-1">Request Changes</p>
                    <p className="text-xs text-muted-foreground">Describe what you'd like us to revise. Our team will review and send an updated proposal.</p>
                  </div>
                  <textarea
                    id="proposal-changes-textarea"
                    rows={5}
                    value={changeNote}
                    onChange={(e) => setChangeNote(e.target.value)}
                    className="w-full rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                    placeholder="e.g., Can you break the payment into 3 milestones? Also, can we extend the timeline to 8 weeks?..."
                  />
                  <div className="flex gap-3">
                    <button
                      id="proposal-changes-submit"
                      onClick={handleRequestChanges}
                      disabled={!changeNote.trim() || submittingChange}
                      className="flex-1 gradient-bg rounded-xl py-3 text-sm font-bold text-primary-foreground disabled:opacity-50 hover:opacity-90 transition-opacity"
                    >
                      {submittingChange ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Submit Changes"}
                    </button>
                    <button
                      onClick={() => setPhase("view")}
                      className="px-6 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          © {new Date().getFullYear()} {companyName} · <Link to="/contact" className="text-primary">Contact Us</Link>
        </p>
      </motion.div>
    </div>
  );
};

export default ClientProposal;
