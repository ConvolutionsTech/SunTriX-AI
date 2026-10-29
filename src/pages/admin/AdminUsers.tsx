import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { apiRequest, ENDPOINTS } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

interface StaffUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "viewer";
  createdAt?: string;
}

const inputClass =
  "w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary";

/** /admin/users — admins manage who can sign in. Viewers are read-only and can't open this page's data. */
const AdminUsers = () => {
  const { user: me } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState({ email: "", name: "", role: "viewer" as StaffUser["role"], password: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await apiRequest<{ users: StaffUser[] }>(ENDPOINTS.ADMIN_USERS);
    if (error) setLoadError(error);
    else setUsers(data?.users ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await apiRequest(ENDPOINTS.ADMIN_USERS, { method: "POST", body: form });
    setSaving(false);
    if (error) return toast({ title: "Could not add user", description: error, variant: "destructive" });
    toast({ title: "User added", description: `${form.email} can now sign in.` });
    setForm({ email: "", name: "", role: "viewer", password: "" });
    load();
  };

  const changeRole = async (u: StaffUser, role: StaffUser["role"]) => {
    const { error } = await apiRequest(ENDPOINTS.ADMIN_USER(u.id), { method: "PATCH", body: { role } });
    if (error) toast({ title: "Could not change role", description: error, variant: "destructive" });
    load();
  };

  const remove = async (u: StaffUser) => {
    if (!window.confirm(`Remove ${u.email}? They will be signed out immediately.`)) return;
    const { error } = await apiRequest(ENDPOINTS.ADMIN_USER(u.id), { method: "DELETE" });
    if (error) toast({ title: "Could not remove user", description: error, variant: "destructive" });
    load();
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Users & Access" description="Admins can change everything; viewers can only look." />

      {loadError ? (
        <p role="alert" className="text-sm text-destructive">{loadError}</p>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground border-b border-border">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-3 text-foreground">{u.name}{u.id === me?.id && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}</td>
                  <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                  <td className="px-4 py-3">
                    <select
                      aria-label={`Role for ${u.email}`}
                      value={u.role}
                      onChange={(e) => changeRole(u, e.target.value as StaffUser["role"])}
                      className="rounded-md border border-border bg-muted/50 px-2 py-1 text-sm"
                    >
                      <option value="admin">Admin</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {u.id !== me?.id && (
                      <button onClick={() => remove(u)} aria-label={`Remove ${u.email}`} className="p-1.5 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loadError && (
        <form onSubmit={create} className="rounded-xl border border-border bg-card p-6 grid gap-4 sm:grid-cols-2">
          <h2 className="sm:col-span-2 text-base font-semibold text-foreground">Add a user</h2>
          <div>
            <label htmlFor="new-user-name" className="text-sm font-medium mb-1.5 block">Name</label>
            <input id="new-user-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} required />
          </div>
          <div>
            <label htmlFor="new-user-email" className="text-sm font-medium mb-1.5 block">Email</label>
            <input id="new-user-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} required />
          </div>
          <div>
            <label htmlFor="new-user-role" className="text-sm font-medium mb-1.5 block">Role</label>
            <select id="new-user-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as StaffUser["role"] })} className={inputClass}>
              <option value="viewer">Viewer (read-only)</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div>
            <label htmlFor="new-user-password" className="text-sm font-medium mb-1.5 block">Temporary password (12+ characters)</label>
            <input id="new-user-password" type="password" autoComplete="new-password" minLength={12} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputClass} required />
          </div>
          <div className="sm:col-span-2">
            <button type="submit" disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              {saving ? "Adding…" : "Add user"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default AdminUsers;
