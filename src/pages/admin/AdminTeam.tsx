import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest, ENDPOINTS } from "@/lib/api";
import { Plus, Trash2, Edit2, GripVertical, Linkedin, Twitter, Github, Globe, X, Check, Copy } from "lucide-react";
import { BulkActionBar } from "@/components/admin/BulkActionBar";
import AIAssistPanel from "@/components/admin/AIAssistPanel";
import { SortableList } from "@/components/admin/SortableList";
import { SortableItem, DragHandle } from "@/components/admin/SortableItem";
import { SortControl, SortOption } from "@/components/admin/SortControl";
import { toast } from "sonner";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { safeHref } from "@/lib/sanitize";

interface TeamMember {
  _id: string;
  name: string;
  role: string;
  department: string;
  bio: string;
  imageUrl?: string;
  linkedin?: string;
  twitter?: string;
  github?: string;
  website?: string;
  order: number;
  isVisible: boolean;
}

const emptyMember: Omit<TeamMember, "_id" | "order"> = {
  name: "",
  role: "",
  department: "",
  bio: "",
  imageUrl: "",
  linkedin: "",
  twitter: "",
  github: "",
  website: "",
  isVisible: true,
};

const AdminTeam = () => {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [form, setForm] = useState(emptyMember);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [aiMode, setAiMode] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>("custom");

  const fetchMembers = async () => {
    setLoading(true);
    const { data } = await apiRequest<TeamMember[]>(`${ENDPOINTS.TEAM_LIST}?all=true`);
    if (data) setMembers(data);
    setLoading(false);
  };

  useEffect(() => { fetchMembers(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyMember);
    setAiMode(false);
    setShowForm(true);
  };

  const openEdit = (member: TeamMember) => {
    setEditing(member);
    setForm({
      name: member.name,
      role: member.role,
      department: member.department,
      bio: member.bio,
      imageUrl: member.imageUrl || "",
      linkedin: member.linkedin || "",
      twitter: member.twitter || "",
      github: member.github || "",
      website: member.website || "",
      isVisible: member.isVisible,
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    if (editing) {
      await apiRequest(ENDPOINTS.TEAM_UPDATE(editing._id), { method: "PUT", body: form });
    } else {
      await apiRequest(ENDPOINTS.TEAM_CREATE, { method: "POST", body: form });
    }
    setSaving(false);
    setShowForm(false);
    fetchMembers();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this team member?")) return;
    try {
      await apiRequest(ENDPOINTS.TEAM_DELETE(id), { method: "DELETE" });
      fetchMembers();
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete team member");
    }
  };

  const handleClone = async (member: TeamMember) => {
    const copy = { 
      ...member, 
      name: `${member.name} (Copy)`,
      isVisible: false
    };
    delete (copy as any)._id;
    
    try {
      await apiRequest(ENDPOINTS.TEAM_CREATE, { method: "POST", body: copy });
      toast.success("Team member duplicated");
      fetchMembers();
    } catch (err) {
      toast.error("Failed to duplicate");
    }
  };

  const handleReorder = async (newMembers: TeamMember[]) => {
    setMembers(newMembers);
    try {
      const ids = newMembers.map(m => m._id);
      await apiRequest(ENDPOINTS.TEAM_REORDER, {
        method: "PUT",
        body: { ids }
      });
      toast.success("Team order saved");
    } catch (err) {
      toast.error("Failed to save order");
      fetchMembers();
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedIds.size} team members?`)) return;
    await Promise.all(Array.from(selectedIds).map((id) => apiRequest(ENDPOINTS.TEAM_DELETE(id), { method: "DELETE" })));
    setSelectedIds(new Set());
    fetchMembers();
  };

  const toggleVisibility = async (member: TeamMember) => {
    await apiRequest(ENDPOINTS.TEAM_UPDATE(member._id), { method: "PUT", body: { ...member, isVisible: !member.isVisible } });
    fetchMembers();
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const bulkActions = [{ label: "Delete Selected", icon: Trash2, variant: "danger" as const, onClick: handleBulkDelete }];

  const sortedMembers = [...members].sort((a, b) => {
    if (sortOption === "custom") return 0;
    if (sortOption === "az") return a.name.localeCompare(b.name);
    if (sortOption === "za") return b.name.localeCompare(a.name);
    return 0; // fallback
  });

  return (
    <div className="space-y-6 font-sans">
      <AdminPageHeader
        title="Team Members & Leadership"
        description="Manage public team profiles, leadership bios, and social channel links."
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
              <Plus className="h-3.5 w-3.5" /> Add Member
            </button>
          </div>
        }
      />

      <div className="flex justify-end mb-6">
        <SortControl value={sortOption} onChange={setSortOption} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <SortableList items={sortedMembers} onReorder={handleReorder} strategy="rect" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {sortedMembers.map((member) => (
              <SortableItem key={member._id} id={member._id} disabled={sortOption !== "custom"}>
              <motion.div
                layout
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`relative bg-card/40 hover:bg-card p-6 flex flex-col items-center text-center rounded-[2rem] border transition-all duration-300 group ${selectedIds.has(member._id) ? "border-primary ring-1 ring-primary shadow-xl" : "border-border/50 hover:border-primary/40 hover:shadow-2xl hover:-translate-y-1"}`}
              >
                {/* Drag Handle */}
                <div className={`absolute top-4 right-4 z-20 transition-opacity bg-background/80 backdrop-blur-sm rounded ${sortOption === "custom" ? "opacity-0 group-hover:opacity-100" : "hidden"}`}>
                  <DragHandle />
                </div>

                {/* Select checkbox */}
                <button
                  onClick={() => toggleSelect(member._id)}
                  className="absolute top-5 left-5 opacity-0 group-hover:opacity-100 transition-opacity z-20"
                >
                  <div className={`h-6 w-6 rounded border-2 flex items-center justify-center transition-colors ${selectedIds.has(member._id) ? "bg-primary border-primary" : "border-muted-foreground bg-background hover:border-primary"}`}>
                    {selectedIds.has(member._id) && <Check className="h-4 w-4 text-white" />}
                  </div>
                </button>
                
                {/* Visibility Toggle Floating */}
                <button
                  onClick={() => toggleVisibility(member)}
                  className={`absolute top-4 right-4 z-20 text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-full border font-bold transition-colors ${sortOption === "custom" ? "mt-10" : ""} ${member.isVisible ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-muted text-muted-foreground border-border"}`}
                >
                  {member.isVisible ? "Visible" : "Hidden"}
                </button>

                {/* Circular Image Container */}
                <div className="relative w-40 h-40 mb-5 mt-4 mx-auto">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-primary to-secondary opacity-0 group-hover:opacity-20 blur-xl transition-opacity duration-500" />
                  <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-primary to-secondary opacity-0 group-hover:opacity-100 scale-105 transition-all duration-500 -z-10" />
                  <div className="relative w-full h-full rounded-full border-[5px] border-background overflow-hidden bg-muted shadow-xl transition-transform duration-500 z-10 group-hover:scale-95">
                    {member.imageUrl ? (
                      <img src={member.imageUrl} alt={member.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
                        <span className="text-5xl font-bold text-primary opacity-70">{member.name.charAt(0)}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="relative z-20 w-full flex-1 flex flex-col">
                  <h3 className="text-xl font-bold text-foreground mb-1 group-hover:text-primary transition-colors">{member.name}</h3>
                  <p className="text-sm font-semibold text-primary mb-0.5">{member.role}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-4 font-medium">{member.department}</p>

                  <p className="text-sm text-muted-foreground mb-6 line-clamp-3 bg-background/50 p-3 rounded-xl border border-border/50 text-left w-full mx-auto flex-1">{member.bio || "No bio provided."}</p>

                  {/* Social Links & Actions */}
                  <div className="flex items-center justify-between w-full mt-auto pt-4 border-t border-border/50">
                    <div className="flex gap-1.5">
                      {member.linkedin && <a href={safeHref(member.linkedin)} target="_blank" rel="noopener noreferrer" className="p-2 rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"><Linkedin className="h-4 w-4" /></a>}
                      {member.twitter && <a href={safeHref(member.twitter)} target="_blank" rel="noopener noreferrer" className="p-2 rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"><Twitter className="h-4 w-4" /></a>}
                      {member.github && <a href={safeHref(member.github)} target="_blank" rel="noopener noreferrer" className="p-2 rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"><Github className="h-4 w-4" /></a>}
                      {member.website && <a href={safeHref(member.website)} target="_blank" rel="noopener noreferrer" className="p-2 rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"><Globe className="h-4 w-4" /></a>}
                    </div>

                    <div className="flex items-center gap-1 bg-background rounded-full border border-border/50 p-1">
                      <button onClick={() => openEdit(member)} className="p-1.5 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" title="Edit">
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleClone(member)} className="p-1.5 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" title="Duplicate">
                        <Copy className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete(member._id)} className="p-1.5 rounded-full text-destructive/70 hover:bg-destructive/10 hover:text-destructive transition-colors" title="Delete">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
              </SortableItem>
            ))}
          </SortableList>

          {members.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
              <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-4">
                <GripVertical className="h-7 w-7 text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-foreground mb-1">No team members yet</h3>
              <p className="text-sm text-muted-foreground mb-4">Add your first team member to display on the About page.</p>
              <button onClick={openCreate} className="bg-primary text-primary-foreground px-5 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
                Add Member
              </button>
            </div>
          )}
        </>
      )}

      {/* Slide-in Form */}
      <AnimatePresence>
        {showForm && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowForm(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 h-full w-full max-w-md bg-card border-l border-border z-50 flex flex-col shadow-2xl"
            >
              <div className="flex items-center justify-between p-6 border-b border-border">
                <h2 className="text-lg font-bold text-foreground">{editing ? "Edit Member" : "Add Team Member"}</h2>
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
                      module="team"
                      onExtracted={(fields) => {
                        setForm((prev) => ({ ...prev, ...fields as Partial<typeof form> }));
                        setAiMode(false);
                      }}
                    />
                  </div>
                )}
              </div>

              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Full Name *</label>
                    <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" placeholder="Jane Smith" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Role / Title *</label>
                    <input required value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" placeholder="Lead Engineer" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Department</label>
                    <input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" placeholder="Engineering" />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Bio</label>
                  <textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} rows={3} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none" placeholder="Short bio about this team member..." />
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Profile Image URL</label>
                  <ImageUpload value={form.imageUrl || ""} onChange={(url) => setForm({ ...form, imageUrl: url })} placeholder="https://..." />
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Social Links</label>
                  <div className="relative">
                    <Linkedin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input value={form.linkedin} onChange={(e) => setForm({ ...form, linkedin: e.target.value })} className="w-full rounded-lg border border-border bg-background pl-10 pr-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" placeholder="LinkedIn URL" />
                  </div>
                  <div className="relative">
                    <Twitter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input value={form.twitter} onChange={(e) => setForm({ ...form, twitter: e.target.value })} className="w-full rounded-lg border border-border bg-background pl-10 pr-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" placeholder="Twitter / X URL" />
                  </div>
                  <div className="relative">
                    <Github className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input value={form.github} onChange={(e) => setForm({ ...form, github: e.target.value })} className="w-full rounded-lg border border-border bg-background pl-10 pr-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" placeholder="GitHub URL" />
                  </div>
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} className="w-full rounded-lg border border-border bg-background pl-10 pr-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" placeholder="Personal website" />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, isVisible: !form.isVisible })}
                    className={`relative h-6 w-11 rounded-full transition-colors ${form.isVisible ? "bg-primary" : "bg-muted"}`}
                  >
                    <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${form.isVisible ? "left-6" : "left-1"}`} />
                  </button>
                  <label className="text-sm font-medium text-foreground">Visible on website</label>
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full bg-primary text-primary-foreground rounded-lg py-3 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60 mt-4"
                >
                  {saving ? "Saving..." : editing ? "Update Member" : "Add Member"}
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

export default AdminTeam;
