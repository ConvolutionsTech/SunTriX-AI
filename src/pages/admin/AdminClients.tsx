import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest, ENDPOINTS } from "@/lib/api";
import { Plus, Trash2, Edit2, Globe, X, Check, Building2, Copy } from "lucide-react";
import { BulkActionBar } from "@/components/admin/BulkActionBar";
import AIAssistPanel from "@/components/admin/AIAssistPanel";
import { SortableList } from "@/components/admin/SortableList";
import { SortableItem, DragHandle } from "@/components/admin/SortableItem";
import { SortControl, SortOption } from "@/components/admin/SortControl";
import { toast } from "sonner";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { safeHref } from "@/lib/sanitize";

interface Client {
  _id: string;
  name: string;
  logoUrl: string;
  websiteUrl?: string;
  isVisible: boolean;
  order: number;
}

const emptyClient = { name: "", logoUrl: "", websiteUrl: "", isVisible: true };

const AdminClients = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState(emptyClient);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [aiMode, setAiMode] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>("custom");

  const fetch_ = async () => {
    setLoading(true);
    const { data } = await apiRequest<any>(`${ENDPOINTS.CLIENTS_LIST}?all=true`);
    if (data) setClients(Array.isArray(data) ? data : data.clients || []);
    setLoading(false);
  };

  useEffect(() => { fetch_(); }, []);

  const openCreate = () => { setEditing(null); setForm(emptyClient); setAiMode(false); setShowForm(true); };
  const openEdit = (c: Client) => { setEditing(c); setForm({ name: c.name, logoUrl: c.logoUrl, websiteUrl: c.websiteUrl || "", isVisible: c.isVisible }); setShowForm(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    if (editing) {
      await apiRequest(ENDPOINTS.CLIENTS_UPDATE(editing._id), { method: "PUT", body: form });
    } else {
      await apiRequest(ENDPOINTS.CLIENTS_CREATE, { method: "POST", body: form });
    }
    setSaving(false);
    setShowForm(false);
    fetch_();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this client?")) return;
    try {
      await apiRequest(ENDPOINTS.CLIENTS_DELETE(id), { method: "DELETE" });
      fetch_();
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete client");
    }
  };

  const handleClone = async (client: Client) => {
    const copy = { 
      ...client, 
      name: `${client.name} (Copy)`,
      isVisible: false
    };
    delete (copy as any)._id;
    
    try {
      await apiRequest(ENDPOINTS.CLIENTS_CREATE, { method: "POST", body: copy });
      toast.success("Client duplicated");
      fetch_();
    } catch (err) {
      toast.error("Failed to duplicate");
    }
  };

  const handleReorder = async (newClients: Client[]) => {
    setClients(newClients);
    try {
      const ids = newClients.map(c => c._id);
      await apiRequest(ENDPOINTS.CLIENTS_REORDER, {
        method: "PUT",
        body: { ids }
      });
      toast.success("Clients order saved");
    } catch (err) {
      toast.error("Failed to save order");
      fetch_();
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedIds.size} clients?`)) return;
    await Promise.all(Array.from(selectedIds).map((id) => apiRequest(ENDPOINTS.CLIENTS_DELETE(id), { method: "DELETE" })));
    setSelectedIds(new Set());
    fetch_();
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const bulkActions = [{ label: "Delete Selected", icon: Trash2, variant: "danger" as const, onClick: handleBulkDelete }];

  const sortedClients = [...clients].sort((a, b) => {
    if (sortOption === "custom") return 0;
    if (sortOption === "az") return a.name.localeCompare(b.name);
    if (sortOption === "za") return b.name.localeCompare(a.name);
    return 0; // fallback
  });

  return (
    <div className="space-y-6 font-sans">
      <AdminPageHeader
        title="Client Directory & Logo Showcase"
        description="Manage client directory profiles, partner logos, and trust badges."
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => { openCreate(); setAiMode(true); }}
              className="px-3.5 py-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 text-xs font-semibold text-purple-400 hover:bg-purple-500/20 transition-all inline-flex items-center gap-1.5"
            >
              <span>✨</span> Draft via AI
            </button>
            <button
              onClick={openCreate}
              className="px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold shadow-xs hover:bg-primary/90 transition-all inline-flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" /> Add Client
            </button>
          </div>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="flex justify-end mb-6">
            <SortControl value={sortOption} onChange={setSortOption} />
          </div>

          {/* Live Preview Strip */}
          {clients.filter((c) => c.isVisible).length > 0 && (
            <div className="mb-8 p-6 rounded-xl bg-card border border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-5">Live Preview</p>
              <div className="flex flex-wrap items-center gap-8">
                {clients.filter((c) => c.isVisible).map((c) => (
                  <div key={c._id} className="group relative">
                    {c.logoUrl ? (
                      <img src={c.logoUrl} alt={c.name} className="h-8 object-contain opacity-60 hover:opacity-100 transition-opacity grayscale hover:grayscale-0" />
                    ) : (
                      <span className="text-sm font-bold text-muted-foreground">{c.name}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <SortableList items={sortedClients} onReorder={handleReorder} strategy="rect" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {sortedClients.map((client) => (
              <SortableItem key={client._id} id={client._id} disabled={sortOption !== "custom"}>
              <motion.div layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                className={`relative bg-card rounded-xl border p-4 flex flex-col group transition-all ${selectedIds.has(client._id) ? "border-primary ring-1 ring-primary" : "border-border"}`}
              >
                <div className={`absolute top-2 right-2 z-20 transition-opacity bg-background/80 backdrop-blur-sm rounded ${sortOption === "custom" ? "opacity-0 group-hover:opacity-100" : "hidden"}`}>
                  <DragHandle />
                </div>
                
                <button
                  onClick={() => toggleSelect(client._id)}
                  className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                >
                  <div className={`h-5 w-5 rounded border-2 flex items-center justify-center ${selectedIds.has(client._id) ? "bg-primary border-primary" : "border-muted-foreground bg-card"}`}>
                    {selectedIds.has(client._id) && <Check className="h-3 w-3 text-white" />}
                  </div>
                </button>

                <div className="h-16 flex items-center justify-center mb-3 bg-muted/30 rounded-lg">
                  {client.logoUrl ? (
                    <img src={client.logoUrl} alt={client.name} className="max-h-10 max-w-full object-contain" />
                  ) : (
                    <div className="flex items-center justify-center text-muted-foreground">
                      <Building2 className="h-8 w-8" />
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm text-foreground">{client.name}</p>
                    {client.websiteUrl && (
                      <a href={safeHref(client.websiteUrl)} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 mt-0.5">
                        <Globe className="h-3 w-3" /> Website
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${client.isVisible ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-muted text-muted-foreground border-border"}`}>
                      {client.isVisible ? "Live" : "Hidden"}
                    </span>
                    <button onClick={() => openEdit(client)} className="p-1 text-muted-foreground hover:text-primary transition-colors">
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => handleClone(client)} className="p-1 text-muted-foreground hover:text-primary transition-colors">
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => handleDelete(client._id)} className="p-1 text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </motion.div>
              </SortableItem>
            ))}

            {clients.length === 0 && (
              <div className="col-span-full text-center py-20 text-muted-foreground">
                <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No clients yet</p>
                <p className="text-sm mb-4">Add your first client logo to display on the homepage.</p>
                <button onClick={openCreate} className="bg-primary text-primary-foreground px-5 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">Add Client</button>
              </div>
            )}
          </SortableList>
        </>
      )}

      {/* Form Drawer */}
      <AnimatePresence>
        {showForm && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowForm(false)} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" />
            <motion.div
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 h-full w-full max-w-sm bg-card border-l border-border z-50 flex flex-col shadow-2xl"
            >
              <div className="flex items-center justify-between p-6 border-b border-border">
                <h2 className="text-lg font-bold text-foreground">{editing ? "Edit Client" : "Add Client"}</h2>
                <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="px-6 pt-4">
                <div className="flex rounded-lg border border-border bg-muted/30 p-0.5 mb-4">
                  <button type="button" onClick={() => setAiMode(true)}
                    className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold transition-all ${
                      aiMode ? "bg-gradient-to-r from-purple-600 to-violet-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}>
                    ✨ AI-Assisted
                  </button>
                  <button type="button" onClick={() => setAiMode(false)}
                    className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold transition-all ${
                      !aiMode ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}>
                    📝 Manual
                  </button>
                </div>
                {aiMode && (
                  <div className="mb-4">
                    <AIAssistPanel
                      module="client"
                      onExtracted={(fields) => {
                        setForm((prev) => ({ ...prev, ...fields as Partial<typeof form> }));
                        setAiMode(false);
                      }}
                    />
                  </div>
                )}
              </div>
              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Client / Company Name *</label>
                  <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" placeholder="Acme Corp" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Logo Image URL *</label>
                  <ImageUpload value={form.logoUrl} onChange={(url) => setForm({ ...form, logoUrl: url })} placeholder="https://..." />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Website URL</label>
                  <input value={form.websiteUrl} onChange={(e) => setForm({ ...form, websiteUrl: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" placeholder="https://acme.com" />
                </div>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => setForm({ ...form, isVisible: !form.isVisible })} className={`relative h-6 w-11 rounded-full transition-colors ${form.isVisible ? "bg-primary" : "bg-muted"}`}>
                    <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${form.isVisible ? "left-6" : "left-1"}`} />
                  </button>
                  <label className="text-sm font-medium text-foreground">Show on website</label>
                </div>
                <button type="submit" disabled={saving} className="w-full bg-primary text-primary-foreground rounded-lg py-3 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60">
                  {saving ? "Saving..." : editing ? "Update Client" : "Add Client"}
                </button>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <BulkActionBar selectedCount={selectedIds.size} onClear={() => setSelectedIds(new Set())} actions={bulkActions} />
    </div>
  );
};

export default AdminClients;
