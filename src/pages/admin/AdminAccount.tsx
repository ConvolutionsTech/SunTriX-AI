import { useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { apiRequest, ENDPOINTS } from "@/lib/api";
import { authManager, useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

const inputClass =
  "w-full rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary";

/** /admin/account — the signed-in user's own account (any role). */
const AdminAccount = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPassword.length < 12) return setError("New password must be at least 12 characters.");
    if (newPassword !== confirm) return setError("New passwords don't match.");

    setSaving(true);
    const { data, error: apiErr } = await apiRequest<{ token: string; refreshToken: string }>(ENDPOINTS.AUTH_PASSWORD, {
      method: "POST",
      body: { currentPassword, newPassword },
    });
    setSaving(false);
    if (apiErr || !data) return setError(apiErr || "Could not change password");

    // Other sessions were signed out; this one continues with the new tokens
    authManager.setTokens(data.token, data.refreshToken);
    setCurrentPassword("");
    setNewPassword("");
    setConfirm("");
    toast({ title: "Password changed", description: "You've been signed out on every other device." });
  };

  return (
    <div className="space-y-6 max-w-xl">
      <AdminPageHeader title="My Account" description={user ? `${user.name || user.email} · ${user.role}` : undefined} />

      <form onSubmit={changePassword} className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h2 className="text-base font-semibold text-foreground">Change password</h2>
        {error && (
          <div role="alert" className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">{error}</div>
        )}
        <div>
          <label htmlFor="current-password" className="text-sm font-medium text-foreground mb-1.5 block">Current password</label>
          <input id="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={inputClass} required />
        </div>
        <div>
          <label htmlFor="new-password" className="text-sm font-medium text-foreground mb-1.5 block">New password (12+ characters)</label>
          <input id="new-password" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputClass} required minLength={12} />
        </div>
        <div>
          <label htmlFor="confirm-password" className="text-sm font-medium text-foreground mb-1.5 block">Confirm new password</label>
          <input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} required minLength={12} />
        </div>
        <button type="submit" disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
          {saving ? "Saving…" : "Change password"}
        </button>
      </form>
    </div>
  );
};

export default AdminAccount;
