import { useState, useEffect, useCallback } from "react";
import { apiRequest, ENDPOINTS } from "@/lib/api";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AdminDataTable } from "@/components/admin/AdminDataTable";
import {
  DollarSign, Plus, Copy, Check, RotateCcw, FileText, X
} from "lucide-react";

interface Payment {
  _id: string;
  type: "subscription" | "invoice" | "retainer";
  status: "pending" | "paid" | "failed" | "refunded" | "cancelled";
  amount: number;
  currency: string;
  clientEmail: string;
  clientName: string;
  description: string;
  invoiceToken?: string;
  stripeSessionId?: string;
  paidAt?: string;
  createdAt: string;
}

interface Stats {
  totalRevenueCents: number;
  pendingCount: number;
  refundedCents: number;
  thisMonthCents: number;
}

interface TaskOption {
  _id: string;
  projectTitle: string;
  name: string;
  email: string;
}

const fmt = (cents: number, cur = "usd") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: cur.toUpperCase() }).format(cents / 100);

export const AdminPayments = () => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [stats, setStats] = useState<Stats>({ totalRevenueCents: 0, pendingCount: 0, refundedCents: 0, thisMonthCents: 0 });
  const [tasks, setTasks] = useState<TaskOption[]>([]);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [refundId, setRefundId] = useState<string | null>(null);

  const [invoiceForm, setInvoiceForm] = useState({ clientEmail: "", clientName: "", amountUSD: "", description: "", taskRequestId: "" });
  const [modalLoading, setModalLoading] = useState(false);
  const [modalErr, setModalErr] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: pData } = await apiRequest<{ payments: Payment[] }>(ENDPOINTS.PAYMENT_ADMIN_LIST);
    if (pData?.payments) setPayments(pData.payments);

    const { data: sData } = await apiRequest<Stats>(ENDPOINTS.PAYMENT_ADMIN_STATS);
    if (sData) setStats(sData);

    const { data: tData } = await apiRequest<{ tasks: TaskOption[] }>(ENDPOINTS.TASK_REQUEST_LIST);
    if (tData?.tasks) setTasks(tData.tasks);

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalLoading(true);
    setModalErr("");

    const cents = Math.round(parseFloat(invoiceForm.amountUSD) * 100);
    if (!cents || cents <= 0) {
      setModalErr("Please enter a valid dollar amount.");
      setModalLoading(false);
      return;
    }

    const { data, error } = await apiRequest<{ payment: Payment; checkoutUrl: string }>(
      ENDPOINTS.PAYMENT_ADMIN_CREATE_INVOICE,
      {
        method: "POST",
        body: {
          clientEmail: invoiceForm.clientEmail,
          clientName: invoiceForm.clientName,
          amountCents: cents,
          description: invoiceForm.description,
          taskRequestId: invoiceForm.taskRequestId || undefined,
        },
      }
    );

    setModalLoading(false);
    if (error || !data) {
      setModalErr(error || "Failed to create invoice");
    } else {
      setShowModal(false);
      setInvoiceForm({ clientEmail: "", clientName: "", amountUSD: "", description: "", taskRequestId: "" });
      fetchData();
    }
  };

  const handleRefund = async (paymentId: string) => {
    if (refundId || !window.confirm("Refund this payment in full through Stripe?")) return;
    setRefundId(paymentId);
    const { data, error } = await apiRequest<{ message: string }>(ENDPOINTS.PAYMENT_ADMIN_REFUND(paymentId), {
      method: "POST",
      body: { reason: "requested_by_customer" },
    });
    setRefundId(null);
    window.alert(error || data?.message || "Refund requested.");
    fetchData();
  };

  const filtered = payments.filter((p) => {
    const matchesTab = activeTab === "all" ? true : p.status === activeTab;
    const q = search.toLowerCase();
    const matchesSearch =
      !search ||
      p.clientName.toLowerCase().includes(q) ||
      p.clientEmail.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q);
    return matchesTab && matchesSearch;
  });

  const tabsWithCounts = [
    { id: "all", label: "All Transactions", count: payments.length },
    { id: "paid", label: "Paid", count: payments.filter((p) => p.status === "paid").length },
    { id: "pending", label: "Pending Invoices", count: payments.filter((p) => p.status === "pending").length },
    { id: "refunded", label: "Refunded", count: payments.filter((p) => p.status === "refunded").length },
  ];

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <AdminPageHeader
        title="Finance & Invoices Workspace"
        description="Stripe checkout session audit logs, transaction tracking, and invoice link generation."
        actions={
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold shadow-xs transition-all"
          >
            <Plus className="h-4 w-4" /> Issue Client Invoice
          </button>
        }
      />

      {/* Financial Metric Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 py-2 border-y border-border/40">
        <div className="space-y-1 py-1">
          <span className="text-xs font-mono text-muted-foreground">Total Revenue</span>
          <p className="text-2xl font-semibold tracking-tight text-foreground">{fmt(stats.totalRevenueCents)}</p>
          <p className="text-[11px] text-muted-foreground">Stripe verified lifetime</p>
        </div>

        <div className="space-y-1 py-1">
          <span className="text-xs font-mono text-muted-foreground">Current Billing Period</span>
          <p className="text-2xl font-semibold tracking-tight text-foreground">{fmt(stats.thisMonthCents)}</p>
          <p className="text-[11px] text-muted-foreground">This month revenue</p>
        </div>

        <div className="space-y-1 py-1">
          <span className="text-xs font-mono text-muted-foreground">Pending Invoices</span>
          <p className="text-2xl font-semibold tracking-tight text-foreground">{stats.pendingCount}</p>
          <p className="text-[11px] text-muted-foreground">Awaiting client checkout</p>
        </div>

        <div className="space-y-1 py-1">
          <span className="text-xs font-mono text-muted-foreground">Refunded Amount</span>
          <p className="text-2xl font-semibold tracking-tight text-foreground">{fmt(stats.refundedCents)}</p>
          <p className="text-[11px] text-muted-foreground">Processed refunds</p>
        </div>
      </div>

      {/* Data Table */}
      <AdminDataTable
        searchQuery={search}
        onSearchChange={setSearch}
        searchPlaceholder="Filter by client name, email, or description…"
        tabs={tabsWithCounts}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        loading={loading}
        isEmpty={filtered.length === 0}
        emptyTitle="No financial records found"
        emptyDescription="There are no payments or invoices matching your filter."
        onRefresh={fetchData}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 border-b border-border/40 text-muted-foreground font-mono uppercase text-[10px] tracking-wider">
              <tr>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filtered.map((p) => (
                <tr key={p._id} className="hover:bg-muted/40 transition-colors">
                  <td className="px-4 py-3.5">
                    <div className="font-semibold text-foreground">{p.clientName}</div>
                    <div className="text-[11px] text-muted-foreground font-mono">{p.clientEmail}</div>
                  </td>

                  <td className="px-4 py-3.5">
                    <div className="font-medium text-foreground">{p.description}</div>
                    <div className="text-[11px] text-muted-foreground font-mono uppercase">{p.type}</div>
                  </td>

                  <td className="px-4 py-3.5 font-mono font-semibold text-foreground">
                    {fmt(p.amount, p.currency)}
                  </td>

                  <td className="px-4 py-3.5">
                    <AdminStatusBadge status={p.status} />
                  </td>

                  <td className="px-4 py-3.5 text-muted-foreground font-mono">
                    {new Date(p.createdAt).toLocaleDateString()}
                  </td>

                  <td className="px-4 py-3.5 text-right space-x-2">
                    {p.invoiceToken && (
                      <button
                        onClick={() => handleCopy(`${window.location.origin}/invoice/${p.invoiceToken}`, p._id)}
                        className="px-2.5 py-1 rounded-md bg-muted hover:bg-muted/80 text-xs font-medium text-foreground inline-flex items-center gap-1"
                      >
                        {copiedId === p._id ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                        {copiedId === p._id ? "Copied" : "Copy Link"}
                      </button>
                    )}

                    {p.status === "paid" && (
                      <button
                        onClick={() => handleRefund(p._id)}
                        disabled={refundId === p._id}
                        className="px-2.5 py-1 rounded-md bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-medium inline-flex items-center gap-1"
                      >
                        <RotateCcw className="h-3 w-3" /> Refund
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminDataTable>

      {/* Invoice Creation Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-card border border-border/60 rounded-xl p-6 shadow-xl space-y-4 font-sans">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" /> Issue Client Invoice
              </h3>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            {modalErr && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-medium">
                {modalErr}
              </div>
            )}

            <form onSubmit={handleCreateInvoice} className="space-y-3 text-xs">
              <div>
                <label className="text-muted-foreground font-mono block mb-1">Select Client Task Brief</label>
                <select
                  onChange={(e) => {
                    const t = tasks.find((item) => item._id === e.target.value);
                    if (t) {
                      setInvoiceForm({
                        ...invoiceForm,
                        taskRequestId: t._id,
                        clientEmail: t.email,
                        clientName: t.name,
                        description: t.projectTitle || "",
                      });
                    }
                  }}
                  className="w-full bg-background border border-border/60 rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary font-mono"
                >
                  <option value="">-- Choose Existing Client Task --</option>
                  {tasks.map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.name} ({t.email}) — {t.projectTitle || "Task"}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-muted-foreground font-mono block mb-1">Client Name *</label>
                <input
                  type="text"
                  required
                  value={invoiceForm.clientName}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, clientName: e.target.value })}
                  className="w-full bg-background border border-border/60 rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary"
                  placeholder="Acme Corp / Jane Doe"
                />
              </div>

              <div>
                <label className="text-muted-foreground font-mono block mb-1">Client Email *</label>
                <input
                  type="email"
                  required
                  value={invoiceForm.clientEmail}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, clientEmail: e.target.value })}
                  className="w-full bg-background border border-border/60 rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary font-mono"
                  placeholder="client@company.com"
                />
              </div>

              <div>
                <label className="text-muted-foreground font-mono block mb-1">Amount (USD $) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={invoiceForm.amountUSD}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, amountUSD: e.target.value })}
                  className="w-full bg-background border border-border/60 rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary font-mono"
                  placeholder="2500.00"
                />
              </div>

              <div>
                <label className="text-muted-foreground font-mono block mb-1">Description *</label>
                <textarea
                  required
                  rows={3}
                  value={invoiceForm.description}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, description: e.target.value })}
                  className="w-full bg-background border border-border/60 rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary resize-y"
                  placeholder="Custom AI Agent Development Deposit"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-border/40">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3.5 py-1.5 rounded-lg bg-muted text-foreground font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  className="px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold shadow-xs"
                >
                  {modalLoading ? "Generating…" : "Generate Invoice Link"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPayments;
