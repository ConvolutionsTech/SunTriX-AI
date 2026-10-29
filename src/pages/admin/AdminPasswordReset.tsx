import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { KeyRound, Mail } from "lucide-react";
import { apiRequest, ENDPOINTS } from "@/lib/api";

const inputClass =
  "w-full rounded-lg border border-border bg-muted/50 pl-10 pr-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary";

/**
 * /admin/forgot-password — request a reset link.
 * /admin/reset-password/:token — choose a new password.
 */
const AdminPasswordReset = () => {
  const { token } = useParams<{ token?: string }>();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const requestLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { data, error: apiErr } = await apiRequest<{ message: string }>(ENDPOINTS.AUTH_FORGOT, { method: "POST", body: { email } });
    setLoading(false);
    if (apiErr) setError(apiErr);
    else setNotice(data?.message || "If that email belongs to an admin, a reset link has been sent.");
  };

  const resetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 12) return setError("Password must be at least 12 characters.");
    if (password !== confirm) return setError("Passwords don't match.");
    setLoading(true);
    const { error: apiErr } = await apiRequest(ENDPOINTS.AUTH_RESET(token!), { method: "POST", body: { password } });
    setLoading(false);
    if (apiErr) setError(apiErr);
    else navigate("/admin/login", { replace: true, state: { notice: "Password reset — sign in with your new password." } });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center bg-grid-pattern">
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative w-full max-w-md mx-4">
        <div className="rounded-2xl border border-border bg-card p-8">
          <div className="text-center mb-8">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl gradient-bg mb-4">
              <KeyRound className="h-6 w-6 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-display font-bold text-foreground">{token ? "Choose a new password" : "Reset your password"}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {token ? "At least 12 characters. This signs you out everywhere." : "We'll email you a link that works for 30 minutes."}
            </p>
          </div>

          {error && (
            <div role="alert" className="mb-4 rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {notice ? (
            <p role="status" className="rounded-lg bg-primary/10 border border-primary/20 px-4 py-3 text-sm text-foreground">{notice}</p>
          ) : token ? (
            <form onSubmit={resetPassword} className="space-y-4">
              <div>
                <label htmlFor="new-password" className="text-sm font-medium text-foreground mb-1.5 block">New password</label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} required minLength={12} />
                </div>
              </div>
              <div>
                <label htmlFor="confirm-password" className="text-sm font-medium text-foreground mb-1.5 block">Confirm password</label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} required minLength={12} />
                </div>
              </div>
              <button type="submit" disabled={loading} className="w-full gradient-bg rounded-lg py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-60">
                {loading ? "Saving…" : "Set new password"}
              </button>
            </form>
          ) : (
            <form onSubmit={requestLink} className="space-y-4">
              <div>
                <label htmlFor="reset-email" className="text-sm font-medium text-foreground mb-1.5 block">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input id="reset-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} required />
                </div>
              </div>
              <button type="submit" disabled={loading} className="w-full gradient-bg rounded-lg py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-60">
                {loading ? "Sending…" : "Email me a reset link"}
              </button>
            </form>
          )}

          <p className="mt-6 text-center text-sm">
            <Link to="/admin/login" className="text-primary hover:underline">Back to sign in</Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default AdminPasswordReset;
