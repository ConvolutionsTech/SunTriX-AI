import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FileText,
  CreditCard,
  CheckCircle,
  Loader2,
  Clock,
  Shield,
  AlertTriangle,
  ExternalLink,
  ArrowRight,
} from "lucide-react";
import { apiRequest, ENDPOINTS } from "@/lib/api";
import { useCompanyInfo } from "@/hooks/useCompanyInfo";

interface InvoiceData {
  _id: string;
  clientName: string;
  clientEmail: string;
  description: string;
  amount: number;
  currency: string;
  status: string;
  type: string;
  checkoutUrl?: string;
  alreadyPaid?: boolean;
  expiresAt?: string;
  trackingToken?: string;
  taskRequestId?: { projectTitle: string; service: string; name: string };
  createdAt: string;
}

const ClientInvoice = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const companyName = useCompanyInfo().name || "SunTriX AI Solutions";

  useEffect(() => {
    if (!token) {
      setError("Invalid invoice link.");
      setLoading(false);
      return;
    }

    const fetchInvoice = async () => {
      const { data, error: err } = await apiRequest<InvoiceData>(ENDPOINTS.PAYMENT_INVOICE(token));
      if (err || !data) setError("Invoice not found or has expired.");
      else setInvoice(data);
    };
    
    fetchInvoice().finally(() => setLoading(false));
  }, [token]);

  const fmt = (cents: number, currency = "usd") =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(cents / 100);

  const handlePay = () => {
    if (!invoice?.checkoutUrl) return;
    setRedirecting(true);
    window.location.href = invoice.checkoutUrl;
  };

  const daysUntilExpiry = (expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );

  if (error)
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="rounded-2xl border border-destructive/30 bg-card p-8 text-center max-w-md">
          <AlertTriangle className="h-10 w-10 text-destructive mx-auto mb-4" />
          <p className="text-destructive font-semibold mb-2">Invoice Not Found</p>
          <p className="text-sm text-muted-foreground mb-6">{error}</p>
          <Link to="/" className="text-primary text-sm underline">
            Go to Homepage
          </Link>
        </div>
      </div>
    );

  if (!invoice) return null;

  const expiry = invoice.expiresAt ? daysUntilExpiry(invoice.expiresAt) : null;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-16">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg"
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="h-12 w-12 rounded-xl gradient-bg flex items-center justify-center shadow-lg">
            <FileText className="h-6 w-6 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">
              {companyName}
            </p>
            <h1 className="text-xl font-extrabold text-foreground">
              {invoice.alreadyPaid ? "Paid Invoice" : "Invoice & Proposal"}
            </h1>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card shadow-xl overflow-hidden">
          {/* Status banner */}
          {invoice.alreadyPaid ? (
            <div className="bg-emerald-500/10 border-b border-emerald-500/20 px-6 py-4 flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0" />
              <div>
                <p className="text-sm font-bold text-emerald-500">Invoice Paid — Thank you!</p>
                <p className="text-xs text-emerald-500/70">
                  This invoice has been fully paid. Your project is active.
                </p>
              </div>
            </div>
          ) : expiry !== null && expiry <= 7 ? (
            <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-4 flex items-center gap-3">
              <Clock className="h-5 w-5 text-amber-500 shrink-0" />
              <div>
                <p className="text-sm font-bold text-amber-500">Payment Pending</p>
                <p className="text-xs text-amber-500/70">
                  This invoice expires in {expiry} day{expiry !== 1 ? "s" : ""} —
                  {" "}
                  {invoice.expiresAt &&
                    new Date(invoice.expiresAt).toLocaleDateString("en-US", { dateStyle: "long" })}
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-primary/5 border-b border-primary/20 px-6 py-4 flex items-center gap-3">
              <Clock className="h-5 w-5 text-primary shrink-0" />
              <div>
                <p className="text-sm font-bold text-primary">Awaiting Payment</p>
                {expiry !== null && (
                  <p className="text-xs text-muted-foreground">
                    Expires on{" "}
                    {invoice.expiresAt &&
                      new Date(invoice.expiresAt).toLocaleDateString("en-US", {
                        dateStyle: "long",
                      })}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Invoice body */}
          <div className="p-6 space-y-5">
            {/* Client & Project Info */}
            <div className="space-y-3">
              <Row label="To" value={invoice.clientName || invoice.clientEmail} />
              <Row label="Email" value={invoice.clientEmail} />
              {invoice.taskRequestId?.projectTitle && (
                <Row label="Project" value={invoice.taskRequestId.projectTitle} />
              )}
              {invoice.taskRequestId?.service && (
                <Row label="Service" value={invoice.taskRequestId.service} />
              )}
              <Row
                label="Issued"
                value={new Date(invoice.createdAt).toLocaleDateString("en-US", {
                  dateStyle: "long",
                })}
              />
            </div>

            {/* Description / Scope */}
            <div className="border-t border-border pt-4">
              <p className="text-xs text-muted-foreground mb-1.5">Proposal / Service Description</p>
              <div className="bg-muted/20 rounded-xl p-4 border border-border">
                <p className="text-sm text-foreground font-medium leading-relaxed">
                  {invoice.description}
                </p>
              </div>
            </div>

            {/* Amount */}
            <div className="rounded-xl bg-muted/30 p-4 flex items-center justify-between border border-border">
              <span className="text-sm text-muted-foreground">Total Amount</span>
              <span className="text-2xl font-extrabold gradient-text">
                {fmt(invoice.amount, invoice.currency)}
              </span>
            </div>

            {/* CTA */}
            {invoice.alreadyPaid ? (
              <div className="space-y-3">
                {invoice.trackingToken && (
                  <button
                    onClick={() => navigate(`/track/${invoice.trackingToken}`)}
                    className="w-full gradient-bg rounded-xl py-4 text-center font-bold text-primary-foreground hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
                  >
                    <ExternalLink className="h-4 w-4" /> Track My Project
                  </button>
                )}
                <Link
                  to="/"
                  className="block w-full rounded-xl border border-border py-3 text-center text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
                >
                  Back to Homepage
                </Link>
              </div>
            ) : invoice.checkoutUrl ? (
              <div className="space-y-3">
                <button
                  onClick={handlePay}
                  disabled={redirecting}
                  className="w-full gradient-bg rounded-xl py-4 text-center font-bold text-primary-foreground hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-95 disabled:opacity-60"
                >
                  {redirecting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Redirecting to Stripe…
                    </>
                  ) : (
                    <>
                      <CreditCard className="h-4 w-4" /> Accept Proposal & Pay{" "}
                      {fmt(invoice.amount, invoice.currency)}
                    </>
                  )}
                </button>
                <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
                  By clicking, you accept this proposal and authorize the payment.
                </p>
              </div>
            ) : (
              <div className="rounded-xl bg-muted/30 p-4 text-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Preparing secure checkout…</p>
              </div>
            )}

            {/* What happens after payment */}
            {!invoice.alreadyPaid && (
              <div className="rounded-xl bg-primary/5 border border-primary/20 p-4 space-y-2">
                <p className="text-xs font-bold text-primary uppercase tracking-wider">
                  After payment
                </p>
                <div className="space-y-1.5">
                  {[
                    "✅ Instant payment confirmation email",
                    "📋 Project status moves to 'In Progress'",
                    "👤 Project manager contacts you within 2 hours",
                    "🚀 Development begins after kickoff call",
                  ].map((item) => (
                    <p key={item} className="text-xs text-muted-foreground">
                      {item}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Security */}
            <div className="flex items-center justify-center gap-2 text-[10px] text-muted-foreground">
              <Shield className="h-3 w-3 text-muted-foreground" />
              Secured by Stripe · We never store your card details ·{" "}
              <Link to="/contact" className="text-primary underline">
                Contact us
              </Link>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          © {new Date().getFullYear()} {companyName}
        </p>
      </motion.div>
    </div>
  );
};

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-2">
    <span className="text-xs text-muted-foreground w-20 shrink-0">{label}</span>
    <span className="text-sm text-foreground font-medium text-right">{value}</span>
  </div>
);

export default ClientInvoice;
