import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest, ENDPOINTS } from "@/lib/api";
import { authManager } from "@/lib/auth";
import { toast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Eye, EyeOff, Star, StarOff, X, Save, Video, Image, Monitor, Copy } from "lucide-react";
import LivePreview from "@/components/admin/LivePreview";
import type { PortfolioPreviewData } from "@/components/admin/LivePreview";
import AIAssistPanel from "@/components/admin/AIAssistPanel";
import { SortableList } from "@/components/admin/SortableList";
import { SortableItem, DragHandle } from "@/components/admin/SortableItem";
import { SortControl, SortOption } from "@/components/admin/SortControl";
import { CSVImporter, ExpectedField } from "@/components/admin/CSVImporter";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { UploadCloud } from "lucide-react";
import { ImageUpload } from "@/components/admin/ImageUpload";

const CATEGORIES = ["Agentic AI", "AI & ML", "Computer Vision", "SaaS Platform"];

interface PortfolioProject {
  _id: string;
  title: string;
  slug: string;
  category: string;
  description: string;
  shortDescription: string;
  metric: string;
  metricLabel: string;
  coverImage: string;
  thumbnailImage: string;
  videoUrl: string;
  images?: string[];
  tags: string[];
  highlights: string[];
  tools: { name: string; icon: string }[];
  clientName: string;
  clientLogo: string;
  industry: string;
  displayType: "video" | "images";
  liveUrl: string;
  status: "published" | "draft";
  featured: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}

type EditState = Omit<PortfolioProject, "_id"> & { _id?: string };

const EMPTY_PROJECT: EditState = {
  title: "", slug: "", category: CATEGORIES[0],
  description: "", shortDescription: "", metric: "", metricLabel: "",
  coverImage: "", thumbnailImage: "", videoUrl: "", tags: [], tools: [],
  clientLogo: "", clientName: "", industry: "", highlights: [],
  status: "draft", featured: false, liveUrl: "", displayType: "video", order: 1,
  createdAt: "", updatedAt: "",
};

const AdminPortfolio = () => {
  const [projects, setProjects] = useState<PortfolioProject[]>([]);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [filter, setFilter] = useState("all");
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [aiMode, setAiMode] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>("custom");
  const [showImport, setShowImport] = useState(false);

  const portfolioFields: ExpectedField[] = [
    { key: "title", label: "Title", required: true },
    { key: "category", label: "Category", required: true },
    { key: "clientName", label: "Client Name" },
    { key: "industry", label: "Industry" },
    { key: "shortDescription", label: "Short Description" },
    { key: "status", label: "Status (published/draft)" }
  ];

  const handleImport = async (items: any[]) => {
    try {
      await apiRequest(ENDPOINTS.PORTFOLIO_LIST + "/bulk/import", {
        method: "POST",
        body: { items }
      });
      reload();
    } catch (err) {
      toast({ title: "Import failed", variant: "destructive" });
      throw err;
    }
  };
  const reload = async () => {
    const { data } = await apiRequest<PortfolioProject[]>(ENDPOINTS.PORTFOLIO_LIST + "?all=true");
    if (data) setProjects(data);
  };

  useEffect(() => { reload(); }, []);

  const filtered = (filter === "all" ? projects : projects.filter((p) =>
    filter === "published" ? p.status === "published" :
    filter === "draft" ? p.status === "draft" :
    filter === "featured" ? p.featured : true
  )).sort((a, b) => {
    if (sortOption === "custom") return 0;
    if (sortOption === "date-desc") return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    if (sortOption === "date-asc") return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
    if (sortOption === "az") return a.title.localeCompare(b.title);
    if (sortOption === "za") return b.title.localeCompare(a.title);
    return 0;
  });

  const handleNew = () => {
    setIsNew(true);
    setAiMode(false);
    setEditing({ ...EMPTY_PROJECT, order: projects.length + 1 });
  };

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.title) { toast({ title: "Title required" }); return; }
    setSaving(true);
    const slug = editing.slug || editing.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const body = { ...editing, slug };
    if (isNew) {
      const { error } = await apiRequest(ENDPOINTS.PORTFOLIO_CREATE, { method: "POST", body });
      if (error) { toast({ title: "Error", description: error }); }
      else toast({ title: "Project created ✅" });
    } else if (editing._id) {
      const { error } = await apiRequest(ENDPOINTS.PORTFOLIO_UPDATE(editing._id), { method: "PUT", body });
      if (error) { toast({ title: "Error", description: error }); }
      else toast({ title: "Project updated ✅" });
    }
    setSaving(false);
    setEditing(null);
    setIsNew(false);
    reload();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this project?")) return;
    try {
      await apiRequest(ENDPOINTS.PORTFOLIO_DELETE(id), { method: "DELETE" });
      toast({ title: "Project deleted" });
      reload();
    } catch (error) {
      console.error(error);
      toast({ title: "Failed to delete project", variant: "destructive" });
    }
  };

  const handleReorder = async (newFiltered: PortfolioProject[]) => {
    if (filter !== "all") {
      toast({ title: "Please switch to 'All' filter to reorder", variant: "destructive" });
      return;
    }
    setProjects(newFiltered);
    try {
      const ids = newFiltered.map(p => p._id);
      await apiRequest(ENDPOINTS.PORTFOLIO_REORDER, { method: "PUT", body: { ids } });
      toast({ title: "Order saved" });
    } catch (err) {
      toast({ title: "Failed to save order", variant: "destructive" });
      reload();
    }
  };

  const toggleStatus = async (p: PortfolioProject) => {
    await apiRequest(ENDPOINTS.PORTFOLIO_UPDATE(p._id), {
      method: "PUT",
      body: { status: p.status === "published" ? "draft" : "published" },
    });
    reload();
  };

  const handleClone = async (p: PortfolioProject) => {
    const slug = `${p.slug}-copy-${Math.random().toString(36).substring(2, 7)}`;
    const copy = { 
      ...p, 
      title: `${p.title} (Copy)`,
      slug,
      status: "draft" as const
    };
    delete (copy as any)._id;
    delete (copy as any).createdAt;
    delete (copy as any).updatedAt;
    
    try {
      await apiRequest(ENDPOINTS.PORTFOLIO_CREATE, { method: "POST", body: copy });
      toast({ title: "Project duplicated" });
      reload();
    } catch (err) {
      toast({ title: "Failed to duplicate", variant: "destructive" });
    }
  };

  const toggleFeatured = async (p: PortfolioProject) => {
    await apiRequest(ENDPOINTS.PORTFOLIO_UPDATE(p._id), { method: "PUT", body: { featured: !p.featured } });
    reload();
  };

  const inp = "w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary";
  const btn = "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all";

  const UploadButton = ({ onUpload, onUploadMultiple, type = "image", multiple = false }: { 
    onUpload?: (url: string) => void, 
    onUploadMultiple?: (urls: string[]) => void,
    type?: "image" | "video",
    multiple?: boolean
  }) => {
    const [up, setUp] = useState(false);
    const handlePick = () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = type === "image" ? "image/*" : "video/*";
      input.multiple = multiple;
      input.onchange = async (e) => {
        const files = Array.from((e.target as HTMLInputElement).files || []);
        if (files.length === 0) return;
        setUp(true);
        
        const token = authManager.getToken();
        const endpoint = type === "image" ? ENDPOINTS.UPLOAD_IMAGE : ENDPOINTS.UPLOAD_VIDEO;

        try {
          const uploadPromises = files.map(async (file) => {
            const formData = new FormData();
            formData.append("file", file);
            const res = await fetch(endpoint, {
              method: "POST",
              headers: token ? { Authorization: `Bearer ${token}` } : {},
              body: formData,
            });
            const data = await res.json();
            return data.secureUrl || data.url;
          });

          const urls = await Promise.all(uploadPromises);
          
          if (multiple && onUploadMultiple) {
            onUploadMultiple(urls);
          } else if (onUpload) {
            onUpload(urls[0]);
          }
          toast({ title: files.length > 1 ? `Uploaded ${files.length} files ✅` : "Uploaded ✅" });
        } catch {
          toast({ title: "Upload failed" });
        } finally { setUp(false); }
      };
      input.click();
    };
    return (
      <button onClick={handlePick} disabled={up} className={`${btn} bg-primary/10 text-primary hover:bg-primary/20 shrink-0`}>
        <Plus className="h-3 w-3" /> {up ? "..." : multiple ? "Upload Multiple" : "Upload"}
      </button>
    );
  };

  return (
    <div className="space-y-6 font-sans">
      <AdminPageHeader
        title="Portfolio Showcase & Case Studies"
        description="Public project portfolio, AI case study drafting, and client showcase management."
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => { handleNew(); setAiMode(true); }}
              className="px-3.5 py-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 text-xs font-semibold text-purple-400 hover:bg-purple-500/20 transition-all inline-flex items-center gap-1.5"
            >
              <span>✨</span> Draft via AI
            </button>
            <button
              onClick={() => setShowImport(true)}
              className="px-3.5 py-1.5 rounded-lg border border-border/60 bg-background text-xs font-semibold text-foreground hover:bg-muted transition-all inline-flex items-center gap-1.5"
            >
              <UploadCloud className="h-3.5 w-3.5" /> Import CSV
            </button>
            <button
              onClick={() => { handleNew(); setAiMode(false); }}
              className="px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold shadow-xs hover:bg-primary/90 transition-all inline-flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" /> Add Project
            </button>
          </div>
        }
      />

      {/* Filters & Sort */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex gap-2">
          {["all", "published", "draft", "featured"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                filter === f ? "gradient-bg text-primary-foreground" : "border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}{f !== "all" && ` (${projects.filter((p) =>
                f === "published" ? p.status === "published" :
                f === "draft" ? p.status === "draft" : p.featured
              ).length})`}
            </button>
          ))}
        </div>
        <SortControl value={sortOption} onChange={setSortOption} />
      </div>

      {/* Project Grid */}
      <SortableList items={filtered} onReorder={handleReorder} strategy="rect" className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((project) => (
          <SortableItem key={project._id} id={project._id} disabled={sortOption !== "custom" || filter !== "all"}>
          <motion.div
            layout
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-xl border border-border bg-card overflow-hidden group relative"
          >
            <div className={`absolute top-2 left-2 z-20 transition-opacity bg-black/40 backdrop-blur-sm rounded ${sortOption === "custom" && filter === "all" ? "opacity-0 group-hover:opacity-100" : "hidden"}`}>
              <DragHandle className="text-white hover:text-white" />
            </div>
            <div className="h-36 bg-gradient-to-br from-primary/10 via-secondary/5 to-transparent flex items-center justify-center relative">
              {project.coverImage ? (
                <img src={project.coverImage} alt={project.title} className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl font-extrabold gradient-text">{project.metric}</span>
              )}
              <div className="absolute top-2 right-2 flex gap-1">
                <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${
                  project.status === "published" ? "bg-success/20 text-success" : "bg-muted text-muted-foreground"
                }`}>{project.status}</span>
                {project.featured && <span className="text-xs rounded-full bg-gold/20 text-gold px-2 py-0.5 font-medium">★</span>}
              </div>
            </div>
            <div className="p-4">
              <p className="text-xs text-primary font-medium mb-1">{project.category}</p>
              <h3 className="text-sm font-bold text-foreground mb-1 line-clamp-1">{project.title}</h3>
              <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{project.shortDescription}</p>
              <div className="flex flex-wrap gap-1 mb-3">
                {project.tags.slice(0, 3).map((tag) => (
                  <span key={tag} className="text-[10px] font-mono text-muted-foreground bg-muted rounded px-1.5 py-0.5">{tag}</span>
                ))}
              </div>
              <div className="flex items-center gap-1.5 border-t border-border pt-3">
                <button onClick={() => { setEditing({ ...project, images: project.images || [] }); setIsNew(false); }} className="flex-1 flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors">
                  <Pencil className="h-3 w-3" /> Edit
                </button>
                <button onClick={() => toggleStatus(project)} className="flex-1 flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors">
                  {project.status === "published" ? <><EyeOff className="h-3 w-3" /> Unpublish</> : <><Eye className="h-3 w-3" /> Publish</>}
                </button>
                <button onClick={() => toggleFeatured(project)} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors">
                  {project.featured ? <Star className="h-3.5 w-3.5 fill-gold text-gold" /> : <StarOff className="h-3.5 w-3.5" />}
                </button>
                <button onClick={() => handleClone(project)} className="p-1.5 rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors">
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => handleDelete(project._id)} className="p-1.5 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
          </SortableItem>
        ))}

        {filtered.length === 0 && (
          <div className="col-span-full py-16 text-center text-muted-foreground">
            No projects found. <button onClick={handleNew} className="text-primary underline ml-1">Add one</button>
          </div>
        )}
      </SortableList>

      {/* Edit Modal */}
      <AnimatePresence>
        {editing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-start justify-center pt-10 overflow-y-auto"
            onClick={(e) => { if (e.target === e.currentTarget) { setEditing(null); setIsNew(false); } }}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6 mb-10 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-foreground">{isNew ? "New Project" : "Edit Project"}</h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowPreview(!showPreview)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                      showPreview ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <Monitor className="h-3.5 w-3.5" />
                    {showPreview ? "Hide Preview" : "Live Preview"}
                  </button>
                  <button onClick={() => { setEditing(null); setIsNew(false); setShowPreview(false); }} className="p-1 rounded-lg hover:bg-muted transition-colors">
                    <X className="h-5 w-5 text-muted-foreground" />
                  </button>
                </div>
              </div>

              {/* AI / Manual mode toggle */}
              <div className="flex rounded-lg border border-border bg-muted/30 p-0.5 mb-5">
                <button
                  type="button"
                  onClick={() => setAiMode(true)}
                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold transition-all ${
                    aiMode ? "bg-gradient-to-r from-purple-600 to-violet-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  ✨ AI-Assisted
                </button>
                <button
                  type="button"
                  onClick={() => setAiMode(false)}
                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold transition-all ${
                    !aiMode ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  📝 Manual
                </button>
              </div>

              {/* AI Panel */}
              {aiMode && (
                <div className="mb-5">
                  <AIAssistPanel
                    module="portfolio"
                    onExtracted={(fields) => {
                      setEditing((prev) => prev ? { ...prev, ...fields } : prev);
                      setAiMode(false);
                    }}
                  />
                </div>
              )}

              <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Title *</label>
                    <input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} className={inp} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Slug</label>
                    <input value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} placeholder="auto-generated" className={inp} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Publish Status *</label>
                    <select
                      value={editing.status || "draft"}
                      onChange={(e) => setEditing({ ...editing, status: e.target.value as "published" | "draft" })}
                      className={inp}
                    >
                      <option value="published">🟢 Published (Visible on Website)</option>
                      <option value="draft">🟡 Draft (Admin Only)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Featured Showcase</label>
                    <button
                      type="button"
                      onClick={() => setEditing({ ...editing, featured: !editing.featured })}
                      className={`w-full py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                        editing.featured
                          ? "border-amber-500/50 bg-amber-500/10 text-amber-500 shadow-2xs"
                          : "border-border bg-card text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <Star className={`h-4 w-4 ${editing.featured ? "fill-amber-500 text-amber-500" : ""}`} />
                      <span>{editing.featured ? "Featured Project" : "Standard Project"}</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Category</label>
                    <select value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} className={inp}>
                      {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Industry</label>
                    <input value={editing.industry} onChange={(e) => setEditing({ ...editing, industry: e.target.value })} className={inp} />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Metric Value</label>
                    <input value={editing.metric} onChange={(e) => setEditing({ ...editing, metric: e.target.value })} placeholder="e.g. 10x" className={inp} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Metric Label</label>
                    <input value={editing.metricLabel} onChange={(e) => setEditing({ ...editing, metricLabel: e.target.value })} placeholder="e.g. Faster Processing" className={inp} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Client Name</label>
                    <input value={editing.clientName} onChange={(e) => setEditing({ ...editing, clientName: e.target.value })} className={inp} />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Short Description</label>
                  <input value={editing.shortDescription} onChange={(e) => setEditing({ ...editing, shortDescription: e.target.value })} className={inp} />
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Full Description</label>
                  <textarea value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} rows={4} className={inp + " resize-none"} />
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">Project Media & Display</label>
                      <div className="flex gap-4 p-4 rounded-xl border border-border bg-muted/30">
                        {(["video", "images"] as const).map((t) => (
                          <button
                            key={t}
                            onClick={() => setEditing({ ...editing, displayType: t })}
                            className={`flex-1 py-3 px-4 rounded-lg border-2 transition-all flex flex-center gap-2 font-bold uppercase text-xs ${
                              editing.displayType === t 
                                ? "border-primary bg-primary/10 text-primary shadow-[0_0_20px_rgba(var(--primary),0.1)]" 
                                : "border-border bg-card text-muted-foreground hover:border-primary/50"
                            }`}
                          >
                            {t === "video" ? <Video className="h-4 w-4" /> : <Image className="h-4 w-4" />}
                            {t} Demo
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Cover Image URL</label>
                      <ImageUpload value={editing.coverImage} onChange={(url) => setEditing({ ...editing, coverImage: url })} placeholder="Cloudinary or external URL" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Thumbnail URL</label>
                      <ImageUpload value={editing.thumbnailImage} onChange={(url) => setEditing({ ...editing, thumbnailImage: url })} placeholder="Card thumbnail" />
                    </div>
                  </div>

                  {editing.displayType === "video" ? (
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Demo Video URL</label>
                      <ImageUpload value={editing.videoUrl} onChange={(url) => setEditing({ ...editing, videoUrl: url })} placeholder="YouTube or local video URL" />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Project Gallery (Min 3, Max 6 images)</label>
                        <UploadButton 
                          multiple 
                          onUploadMultiple={(urls) => {
                            const newImgs = [...(editing.images || [])];
                            urls.forEach((url, i) => {
                              if (i < 6) newImgs[i] = url;
                            });
                            setEditing({ ...editing, images: newImgs });
                          }} 
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        {[0, 1, 2, 3, 4, 5].map((idx) => (
                          <div key={idx} className="relative aspect-video rounded-lg border border-border bg-muted/50 overflow-hidden group">
                            {(editing.images || [])[idx] ? (
                              <>
                                <img 
                                  src={editing.images[idx]} 
                                  alt={`Gallery ${idx + 1}`} 
                                  className="w-full h-full object-cover" 
                                />
                                <button
                                  onClick={() => {
                                    const newImgs = [...(editing.images || [])];
                                    newImgs[idx] = "";
                                    setEditing({ ...editing, images: newImgs });
                                  }}
                                  className="absolute top-1 right-1 p-1 rounded-full bg-background/80 text-destructive opacity-0 group-hover:opacity-100 transition-opacity hover:bg-background"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                                <div className="absolute bottom-0 inset-x-0 bg-background/60 backdrop-blur-sm py-1 text-[10px] text-center font-medium text-foreground">
                                  Img {idx + 1}
                                </div>
                              </>
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-muted-foreground text-[10px] font-medium">
                                Slot {idx + 1}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Live Project URL (Optional)</label>
                    <input value={editing.liveUrl} onChange={(e) => setEditing({ ...editing, liveUrl: e.target.value })} placeholder="https://external-project-link.com" className={inp} />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Tags (comma separated)</label>
                  <input
                    value={editing.tags.join(", ")}
                    onChange={(e) => setEditing({ ...editing, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
                    placeholder="React, Python, AWS"
                    className={inp}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Highlights (comma separated)</label>
                  <input
                    value={editing.highlights.join(", ")}
                    onChange={(e) => setEditing({ ...editing, highlights: e.target.value.split(",").map((h) => h.trim()).filter(Boolean) })}
                    placeholder="99% accuracy, 50K users"
                    className={inp}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Status</label>
                    <select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value as "published" | "draft" })} className={inp}>
                      <option value="draft">Draft</option>
                      <option value="published">Published</option>
                    </select>
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={editing.featured} onChange={(e) => setEditing({ ...editing, featured: e.target.checked })} className="rounded border-border" />
                      <span className="text-sm text-foreground">Featured Project</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
                <button onClick={() => { setEditing(null); setIsNew(false); }} className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors">
                  Cancel
                </button>
                <button onClick={handleSave} disabled={saving} className="gradient-bg inline-flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50">
                  <Save className="h-4 w-4" /> {saving ? "Saving..." : isNew ? "Create" : "Save Changes"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Live Preview Panel */}
      <LivePreview
        data={editing && showPreview ? {
          type: "portfolio",
          title: editing.title,
          category: editing.category,
          shortDescription: editing.shortDescription,
          metric: editing.metric,
          metricLabel: editing.metricLabel,
          coverImage: editing.coverImage,
          thumbnailImage: editing.thumbnailImage,
          videoUrl: editing.videoUrl,
          liveUrl: editing.liveUrl,
          tags: editing.tags,
          tools: editing.tools,
          highlights: editing.highlights,
          status: editing.status || "draft",
          featured: editing.featured,
          displayType: editing.displayType,
          images: editing.images || [],
        } satisfies PortfolioPreviewData : null}
        onClose={() => setShowPreview(false)}
      />
      
      <CSVImporter 
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onImport={handleImport}
        expectedFields={portfolioFields}
        moduleName="Portfolio"
      />
    </div>
  );
};

export default AdminPortfolio;
