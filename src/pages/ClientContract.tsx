import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ScrollText, CheckCircle, AlertTriangle, Loader2, PenLine, Lock,
} from "lucide-react";
import { apiRequest, ENDPOINTS } from "@/lib/api";
import { useCompanyInfo } from "@/hooks/useCompanyInfo";

interface Contract {
  _id: string;
  contractToken: string;
  projectTitle: string;
  clientName: string;
  clientEmail: string;
  fullContractText: string;
  status: "pending" | "signed" | "expired";
  signedAt?: string;
  clientSignatureName?: string;
  expiresAt: string;
}

const ClientContract = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sigName, setSigName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);
  const [trackerToken, setTrackerToken] = useState("");
  const companyName = useCompanyInfo().name || "SunTriX AI Solutions";

  useEffect(() => {
    if (!token) { setError("Invalid contract link."); setLoading(false); return; }
    
    const fetchContract = async () => {
      const { data, error: err } = await apiRequest<Contract>(ENDPOINTS.CONTRACT_BY_TOKEN(token));
      if (err || !data) setError(err || "Contract not found.");
      else {
        setContract(data);
        if (data.status === "signed") {
          setSigned(true);
          setSigName(data.clientSignatureName || "");
        }
      }
    };

    fetchContract().finally(() => setLoading(false));
  }, [token]);

  const handleSign = async () => {
    if (!sigName.trim() || !agreed || !token) return;
    setSigning(true);
    const { data, error: err } = await apiRequest<{ trackerToken: string }>(
      ENDPOINTS.CONTRACT_SIGN(token),
      { method: "POST", body: { clientSignatureName: sigName.trim(), agreed: true } }
    );
    setSigning(false);
    if (err) {
      setError(err);
    } else {
      setTrackerToken(data?.trackerToken || "");
      setSigned(true);
    }
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
        <p className="text-destructive font-semibold mb-2">Contract Unavailable</p>
        <p className="text-sm text-muted-foreground mb-6">{error}</p>
        <Link to="/contact" className="text-primary text-sm underline">Contact Support</Link>
      </div>
    </div>
  );

  if (!contract) return null;

  // ── Already Signed State ──────────────────────────────────────────────────
  if (signed) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4 py-16">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-lg w-full text-center">
          <div className="rounded-2xl border border-emerald-500/30 bg-card p-10 shadow-xl">
            <div className="h-20 w-20 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="h-10 w-10 text-emerald-500" />
            </div>
            <h1 className="text-2xl font-extrabold text-foreground mb-3">Contract Signed! 🎉</h1>
            <p className="text-muted-foreground mb-2">
              Thank you, <strong className="text-foreground">{sigName}</strong>. Your contract is signed and your project is officially confirmed.
            </p>
            <p className="text-sm text-muted-foreground mb-6">
              Our team has been notified. They'll create your first milestone invoice and reach out to schedule your project kickoff.
            </p>
            <div className="space-y-3">
              {trackerToken && (
                <Link
                  to={`/client/project/${trackerToken}`}
                  className="block w-full gradient-bg rounded-xl py-3 text-sm font-bold text-primary-foreground hover:opacity-90 transition-opacity shadow-lg shadow-primary/20"
                >
                  Go to Project Hub →
                </Link>
              )}
              <Link
                to="/"
                className="block w-full rounded-xl border border-border py-3 text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
              >
                Back to Homepage
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Contract View + Signing ──────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background px-4 py-16">
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="h-12 w-12 rounded-xl bg-violet-600 flex items-center justify-center shadow-lg">
            <ScrollText className="h-6 w-6 text-white" />
          </div>
          <div>
            <p className="text-xs font-mono text-primary uppercase tracking-widest">{companyName}</p>
            <h1 className="text-xl font-extrabold text-foreground">Service Agreement</h1>
          </div>
        </div>

        {/* Expiry Info */}
        <div className="mb-6 bg-violet-500/10 border border-violet-500/20 rounded-xl px-5 py-3 flex items-center gap-3">
          <Lock className="h-4 w-4 text-violet-400 shrink-0" />
          <p className="text-sm text-violet-300">
            This contract expires on <strong>{new Date(contract.expiresAt).toLocaleDateString("en-US", { dateStyle: "long" })}</strong>.
            Please sign before the deadline to confirm your project.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card shadow-xl overflow-hidden">
          {/* Contract Title */}
          <div className="bg-gradient-to-r from-violet-600 to-purple-700 px-8 py-6">
            <h2 className="text-xl font-extrabold text-white">{contract.projectTitle}</h2>
            <p className="text-white/70 text-sm mt-1">Between {companyName} and {contract.clientName}</p>
          </div>

          {/* Contract Body */}
          <div className="p-8">
            <div className="rounded-xl bg-muted/20 border border-border p-6 mb-8 max-h-[60vh] overflow-y-auto">
              <pre className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap font-sans">
                {contract.fullContractText}
              </pre>
            </div>

            {/* Signature Section */}
            <div className="space-y-6">
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <PenLine className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-bold text-foreground">Digital Signature</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  By typing your full legal name below and checking the agreement checkbox, you are digitally signing
                  this service agreement. This constitutes a legally binding acceptance of the contract terms.
                </p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                      Type your full legal name to sign *
                    </label>
                    <input
                      id="contract-signature-name"
                      type="text"
                      value={sigName}
                      onChange={(e) => setSigName(e.target.value)}
                      placeholder="Your Full Name (e.g. John Smith)"
                      className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary font-semibold"
                    />
                    {sigName && (
                      <div className="mt-2 px-4 py-2 bg-muted/30 rounded-lg border border-border">
                        <p className="text-xs text-muted-foreground mb-0.5">Signature Preview</p>
                        <p className="text-lg font-bold text-foreground" style={{ fontFamily: "cursive" }}>{sigName}</p>
                      </div>
                    )}
                  </div>

                  <label id="contract-agree-label" className="flex items-start gap-3 cursor-pointer">
                    <input
                      id="contract-agree-checkbox"
                      type="checkbox"
                      checked={agreed}
                      onChange={(e) => setAgreed(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-border accent-primary"
                    />
                    <span className="text-sm text-muted-foreground leading-relaxed">
                      I have read, understood, and agree to all terms and conditions in this Service Agreement.
                      I confirm that the information I have provided is accurate and I am authorized to enter into this contract.
                    </span>
                  </label>

                  <button
                    id="contract-sign-btn"
                    onClick={handleSign}
                    disabled={!sigName.trim() || !agreed || signing}
                    className="w-full gradient-bg rounded-xl py-4 font-bold text-primary-foreground disabled:opacity-50 hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20 text-sm active:scale-95"
                  >
                    {signing ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Signing Contract…</>
                    ) : (
                      <><PenLine className="h-4 w-4" /> I Agree & Sign Contract</>
                    )}
                  </button>

                  <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
                    🔒 This signed contract will be recorded with a timestamp.
                    Both parties will receive a copy via email.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          © {new Date().getFullYear()} {companyName} · <Link to="/contact" className="text-primary">Contact Us</Link>
        </p>
      </motion.div>
    </div>
  );
};

export default ClientContract;
