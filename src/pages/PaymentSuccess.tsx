import { useEffect, useState } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  CheckCircle,
  Download,
  ArrowRight,
  Loader2,
  Clock,
  Mail,
  Calendar,
  Rocket,
} from "lucide-react";
import { apiRequest, ENDPOINTS } from "@/lib/api";
import { safeHref } from "@/lib/sanitize";

interface VerifyResult {
  status: string;
  amount: number;
  currency: string;
  email: string;
  description: string;
  paidAt: string;
  receiptUrl?: string;
  trackingToken?: string;
}

const nextSteps = [
  {
    icon: CheckCircle,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    label: "Payment confirmed",
    sub: "Receipt sent to your email",
    done: true,
  },
  {
    icon: Mail,
    color: "text-blue-400",
    bg: "bg-blue-400/10",
    label: "Confirmation email sent",
    sub: "Check your inbox (and spam folder)",
    done: true,
  },
  {
    icon: Clock,
    color: "text-amber-400",
    bg: "bg-amber-400/10",
    label: "Project manager assigned",
    sub: "You'll hear from us within 2 business hours",
    done: false,
  },
  {
    icon: Calendar,
    color: "text-purple-400",
    bg: "bg-purple-400/10",
    label: "Kickoff call scheduled",
    sub: "Within 24 hours of payment",
    done: false,
  },
  {
    icon: Rocket,
    color: "text-primary",
    bg: "bg-primary/10",
    label: "Development begins",
    sub: "After kickoff call approval",
    done: false,
  },
];

const PaymentSuccess = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = params.get("session_id");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sessionId) {
      setError("No session ID found.");
      setLoading(false);
      return;
    }
    apiRequest<VerifyResult>(ENDPOINTS.PAYMENT_VERIFY(sessionId))
      .then(({ data, error: err }) => {
        if (err || !data) setError("Could not verify payment. Please contact support.");
        else setResult(data);
      })
      .finally(() => setLoading(false));
  }, [sessionId]);

  const fmt = (cents: number, currency: string) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency?.toUpperCase() || "USD",
    }).format(cents / 100);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-16">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg"
      >
        {loading ? (
          <div className="text-center">
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Verifying your payment…</p>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/30 bg-card p-8 text-center">
            <p className="text-destructive font-semibold mb-4">{error}</p>
            <Link to="/contact" className="text-primary underline text-sm">
              Contact Support
            </Link>
          </div>
        ) : result ? (
          <div className="space-y-4">
            {/* Success Header Card */}
            <div className="rounded-2xl border border-border bg-card shadow-xl overflow-hidden">
              <div className="bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 p-8 text-center border-b border-border">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
                  className="mx-auto mb-4 h-16 w-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center"
                >
                  <CheckCircle className="h-8 w-8 text-emerald-500" />
                </motion.div>
                <h1 className="text-2xl font-extrabold text-foreground">Payment Confirmed!</h1>
                <p className="text-muted-foreground text-sm mt-1">
                  Your project is now active — welcome to SunTriX!
                </p>
              </div>

              {/* Receipt Details */}
              <div className="p-6 space-y-4">
                <div className="rounded-xl bg-muted/30 p-4 space-y-3">
                  <Row
                    label="Amount Paid"
                    value={fmt(result.amount, result.currency)}
                    highlight
                  />
                  <Row label="Service" value={result.description} />
                  <Row label="Receipt sent to" value={result.email} />
                  <Row
                    label="Payment date"
                    value={new Date(result.paidAt).toLocaleDateString("en-US", {
                      dateStyle: "long",
                    })}
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-1">
                  {result.trackingToken ? (
                    <button
                      onClick={() => navigate(`/track/${result.trackingToken}`)}
                      className="flex-1 gradient-bg rounded-xl py-3 text-center text-sm font-bold text-primary-foreground hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                    >
                      <Rocket className="h-4 w-4" /> Track My Project
                    </button>
                  ) : (
                    <Link
                      to="/contact"
                      className="flex-1 gradient-bg rounded-xl py-3 text-center text-sm font-bold text-primary-foreground hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                    >
                      Contact Us <ArrowRight className="h-4 w-4" />
                    </Link>
                  )}

                  {result.receiptUrl && (
                    <a
                      href={safeHref(result.receiptUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 rounded-xl border border-border py-3 text-center text-sm font-medium hover:bg-muted/50 transition-colors flex items-center justify-center gap-2"
                    >
                      <Download className="h-4 w-4" /> Receipt
                    </a>
                  )}

                  {!result.receiptUrl && (
                    <Link
                      to="/"
                      className="flex-1 rounded-xl border border-border py-3 text-center text-sm font-medium hover:bg-muted/50 transition-colors"
                    >
                      Back to Home
                    </Link>
                  )}
                </div>
              </div>
            </div>

            {/* What Happens Next */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="rounded-2xl border border-border bg-card p-6"
            >
              <h2 className="text-sm font-bold text-foreground uppercase tracking-wider mb-5 flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" /> What happens next
              </h2>
              <div className="space-y-4">
                {nextSteps.map((step, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + i * 0.08 }}
                    className="flex items-start gap-3"
                  >
                    <div
                      className={`h-8 w-8 rounded-full ${step.bg} flex items-center justify-center shrink-0 mt-0.5`}
                    >
                      <step.icon className={`h-4 w-4 ${step.color}`} />
                    </div>
                    <div>
                      <p
                        className={`text-sm font-semibold ${
                          step.done ? "text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {step.label}
                        {step.done && (
                          <span className="ml-2 text-[10px] font-bold bg-emerald-500/15 text-emerald-500 px-1.5 py-0.5 rounded-full">
                            DONE
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">{step.sub}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            <p className="text-center text-xs text-muted-foreground">
              Questions?{" "}
              <Link to="/contact" className="text-primary underline">
                Contact our team
              </Link>
              {" "}— we respond within 2 hours.
            </p>
          </div>
        ) : null}
      </motion.div>
    </div>
  );
};

const Row = ({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) => (
  <div className="flex items-center justify-between gap-2">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span
      className={`text-sm font-semibold ${
        highlight ? "text-emerald-500 text-base" : "text-foreground"
      }`}
    >
      {value}
    </span>
  </div>
);

export default PaymentSuccess;
