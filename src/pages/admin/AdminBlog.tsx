import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest, ENDPOINTS, apiUpload } from "@/lib/api";
import { Plus, Trash2, Edit2, X, Search, Filter, ChevronDown, Calendar, Eye, EyeOff, Clock, Copy, Paperclip } from "lucide-react";
import { BulkActionBar } from "@/components/admin/BulkActionBar";
import AIAssistPanel from "@/components/admin/AIAssistPanel";
import { SortControl, SortOption } from "@/components/admin/SortControl";
import { ImageUpload } from "@/components/admin/ImageUpload";
import MediaUploader, { MediaAttachment } from "@/components/admin/MediaUploader";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useRef, useMemo, useCallback } from "react";

interface BlogPost {
  _id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  coverImage?: string;
  tags: string[];
  category: string;
  status: "draft" | "published" | "scheduled";
  scheduledAt?: string;
  publishedAt?: string;
  author?: string;
  readTime?: number;
  createdAt: string;
  mediaAttachments?: MediaAttachment[];
}

const empty: Omit<BlogPost, "_id" | "createdAt"> = {
  title: "", slug: "", excerpt: "", content: "", coverImage: "",
  tags: [], category: "", status: "draft", scheduledAt: "", publishedAt: "",
  author: "", readTime: 5, mediaAttachments: [],
};

const statusColors: Record<string, string> = {
  published: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  draft: "bg-muted text-muted-foreground border-border",
  scheduled: "bg-amber-500/10 text-amber-500 border-amber-500/20",
};

const AdminBlog = () => {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<BlogPost | null>(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [tagInput, setTagInput] = useState("");
  const [aiMode, setAiMode] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>("date-desc");
  const quillRef = useRef<ReactQuill>(null);

  const fetch_ = async () => {
    setLoading(true);
    const { data } = await apiRequest<{ posts: BlogPost[] }>(`${ENDPOINTS.BLOG_LIST}?all=true`);
    if (data?.posts) setPosts(data.posts);
    setLoading(false);
  };

  useEffect(() => { fetch_(); }, []);

  const imageHandler = useCallback(() => {
    const input = document.createElement("input");
    input.setAttribute("type", "file");
    input.setAttribute("accept", "image/*");
    input.click();

    input.onchange = async () => {
      const file = input.files?.[0];
      if (file) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("folder", "suntrix");

        try {
          const { data, error } = await apiUpload<{ url?: string; secureUrl?: string }>(ENDPOINTS.UPLOAD_IMAGE, formData);
          if (error || !data) throw new Error(error || "Upload failed");
          const url = data.url || data.secureUrl;

          const quill = quillRef.current?.getEditor();
          if (quill && url) {
            const range = quill.getSelection() || { index: quill.getLength() };
            quill.insertEmbed(range.index, "image", url);
            quill.setSelection({ index: range.index + 1, length: 0 });
          }
        } catch (err) {
          console.error("Image upload failed", err);
          alert(`Failed to upload image: ${err instanceof Error ? err.message : "please try again"}`);
        }
      }
    };
  }, []);

  const quillModules = useMemo(() => ({
    toolbar: {
      container: [
        [{ header: [1, 2, 3, false] }],
        ["bold", "italic", "underline", "strike", "blockquote"],
        [{ list: "ordered" }, { list: "bullet" }],
        ["link", "image"],
        ["clean"],
      ],
      handlers: {
        image: imageHandler,
      },
    },
  }), [imageHandler]);

  const slugify = (str: string) => str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  const openCreate = () => {
    setEditing(null);
    setForm(empty);
    setTagInput("");
    setAiMode(false);
    setShowForm(true);
  };

  // The list endpoint omits `content`, so load the full post before editing —
  // otherwise saving would overwrite the article body with an empty value.
  const openEdit = async (listItem: BlogPost) => {
    const { data: p, error } = await apiRequest<BlogPost>(ENDPOINTS.BLOG_BY_ID(listItem._id));
    if (error || !p) {
      alert(`Could not load this post for editing: ${error || "not found"}`);
      return;
    }
    setEditing(p);
    setForm({ title: p.title, slug: p.slug, excerpt: p.excerpt, content: p.content || "", coverImage: p.coverImage || "", tags: p.tags, category: p.category, status: p.status, scheduledAt: p.scheduledAt || "", publishedAt: p.publishedAt || "", author: p.author || "", readTime: p.readTime || 5, mediaAttachments: p.mediaAttachments || [] });
    setTagInput(p.tags.join(", "));
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const tags = tagInput.split(",").map(t => t.trim()).filter(Boolean);
    const payload = { ...form, tags, slug: form.slug || slugify(form.title) };
    if (editing) await apiRequest(ENDPOINTS.BLOG_UPDATE(editing._id), { method: "PUT", body: payload });
    else await apiRequest(ENDPOINTS.BLOG_CREATE, { method: "POST", body: payload });
    setSaving(false);
    setShowForm(false);
    fetch_();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this post?")) return;
    try {
      await apiRequest(ENDPOINTS.BLOG_DELETE(id), { method: "DELETE" });
      fetch_();
    } catch (error) {
      console.error(error);
    }
  };

  const handleClone = async (post: BlogPost) => {
    const slug = `${post.slug}-copy-${Math.random().toString(36).substring(2, 7)}`;
    const copy = { 
      ...post, 
      title: `${post.title} (Copy)`,
      slug,
      status: "draft" as const,
      publishedAt: "",
      scheduledAt: ""
    };
    delete (copy as any)._id;
    delete (copy as any).createdAt;
    
    try {
      await apiRequest(ENDPOINTS.BLOG_CREATE, { method: "POST", body: copy });
      fetch_();
    } catch (err) {
      console.error(err);
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedIds.size} posts?`)) return;
    await apiRequest(ENDPOINTS.BLOG_BULK_DELETE, { method: "DELETE", body: { ids: Array.from(selectedIds) } });
    setSelectedIds(new Set());
    fetch_();
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const toggleAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(p => p._id)));
  };

  const filtered = posts.filter(p => {
    const matchSearch = p.title.toLowerCase().includes(search.toLowerCase()) || p.category.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || p.status === filterStatus;
    return matchSearch && matchStatus;
  }).sort((a, b) => {
    if (sortOption === "date-desc") return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    if (sortOption === "date-asc") return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
    if (sortOption === "az") return a.title.localeCompare(b.title);
    if (sortOption === "za") return b.title.localeCompare(a.title);
    return 0;
  });

  const bulkActions = [{ label: "Delete Selected", icon: Trash2, variant: "danger" as const, onClick: handleBulkDelete }];
  const inputCls = "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary";

  return (
    <div className="space-y-6 font-sans">
      <AdminPageHeader
        title="Blog Posts & Articles"
        description="Publish, schedule, and edit marketing articles and technical blog posts."
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => { openCreate(); setAiMode(true); }}
              className="px-3.5 py-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 text-xs font-semibold text-purple-400 hover:bg-purple-500/20 transition-all inline-flex items-center gap-1.5"
            >
              <span>✨</span> AI Article Drafter
            </button>
            <button
              onClick={() => { openCreate(); setAiMode(false); }}
              className="px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold shadow-xs hover:bg-primary/90 transition-all inline-flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" /> Write Post
            </button>
          </div>
        }
      />

      {/* Filters & Sort */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex flex-wrap gap-3 flex-1 min-w-[200px]">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search posts..." className="w-full rounded-lg border border-border bg-muted/50 pl-10 pr-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="appearance-none rounded-lg border border-border bg-muted/50 pl-10 pr-8 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
              <option value="all">All Statuses</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
              <option value="scheduled">Scheduled</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
          </div>
        </div>
        <SortControl value={sortOption} onChange={setSortOption} hideCustom />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 w-10">
                  <button onClick={toggleAll} className="text-muted-foreground hover:text-foreground">
                    <div className={`h-4 w-4 rounded border-2 ${selectedIds.size === filtered.length && filtered.length > 0 ? "bg-primary border-primary" : "border-muted-foreground"}`} />
                  </button>
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Title</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Category</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Date</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="py-16 text-center text-muted-foreground">No posts found</td></tr>
              ) : filtered.map((post) => (
                <motion.tr key={post._id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-4">
                    <button onClick={() => toggleSelect(post._id)} className="text-muted-foreground hover:text-primary">
                      <div className={`h-4 w-4 rounded border-2 flex items-center justify-center ${selectedIds.has(post._id) ? "bg-primary border-primary" : "border-muted-foreground"}`}>
                        {selectedIds.has(post._id) && <div className="h-2 w-2 rounded-sm bg-white" />}
                      </div>
                    </button>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-start gap-3">
                      {post.coverImage && <img src={post.coverImage} alt="" className="h-10 w-14 rounded object-cover shrink-0" />}
                      <div>
                        <p className="font-medium text-foreground line-clamp-1">{post.title}</p>
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{post.excerpt}</p>
                        {(post.mediaAttachments?.length ?? 0) > 0 && (
                          <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md">
                            <Paperclip className="h-2.5 w-2.5" />
                            {post.mediaAttachments!.length} attachment{post.mediaAttachments!.length !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 hidden md:table-cell">
                    <span className="text-xs bg-muted px-2 py-1 rounded-md text-foreground">{post.category || "—"}</span>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`text-xs px-2.5 py-1 rounded-full border font-medium capitalize flex items-center gap-1 w-fit ${statusColors[post.status]}`}>
                      {post.status === "scheduled" && <Clock className="h-3 w-3" />}
                      {post.status === "published" && <Eye className="h-3 w-3" />}
                      {post.status === "draft" && <EyeOff className="h-3 w-3" />}
                      {post.status}
                    </span>
                    {post.status === "scheduled" && post.scheduledAt && (
                      <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                        <Calendar className="h-3 w-3" />{new Date(post.scheduledAt).toLocaleDateString()}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-4 hidden lg:table-cell text-xs text-muted-foreground">
                    {new Date(post.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(post)} aria-label="Edit post" title="Edit" className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"><Edit2 className="h-4 w-4" /></button>
                      <button onClick={() => handleClone(post)} aria-label="Duplicate post" title="Duplicate" className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"><Copy className="h-4 w-4" /></button>
                      <button onClick={() => handleDelete(post._id)} aria-label="Delete post" title="Delete" className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Form Drawer */}
      <AnimatePresence>
        {showForm && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowForm(false)} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" />
            <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 h-full w-full max-w-lg bg-card border-l border-border z-50 flex flex-col shadow-2xl">
              <div className="flex items-center justify-between p-6 border-b border-border">
                <h2 className="text-lg font-bold text-foreground">{editing ? "Edit Post" : "New Blog Post"}</h2>
                <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted transition-colors"><X className="h-5 w-5" /></button>
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
                      module="blog"
                      onExtracted={(fields) => {
                        const f = fields as Partial<typeof form>;
                        setForm((prev) => ({ ...prev, ...f }));
                        if (typeof fields.tags === "string") setTagInput(fields.tags as string);
                        else if (Array.isArray(fields.tags)) setTagInput((fields.tags as string[]).join(", "));
                        setAiMode(false);
                      }}
                    />
                  </div>
                )}
              </div>
              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Title *</label>
                  <input required value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value, slug: slugify(e.target.value) })}
                    className={inputCls} placeholder="My Awesome Post" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Slug</label>
                  <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} className={inputCls} placeholder="my-awesome-post" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Excerpt</label>
                  <textarea value={form.excerpt} onChange={(e) => setForm({ ...form, excerpt: e.target.value })} rows={2} className={`${inputCls} resize-none`} placeholder="Short summary shown in post lists..." />
                </div>
                <div className="quill-dark">
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Content</label>
                  <ReactQuill
                    ref={quillRef}
                    theme="snow"
                    value={form.content}
                    onChange={(val) => setForm({ ...form, content: val })}
                    className="bg-background text-foreground"
                    modules={quillModules}
                  />
                  <style>{`
                    .quill-dark .ql-toolbar { border-color: hsl(var(--border)); border-top-left-radius: 0.5rem; border-top-right-radius: 0.5rem; background: hsl(var(--muted)/0.5); }
                    .quill-dark .ql-container { border-color: hsl(var(--border)); border-bottom-left-radius: 0.5rem; border-bottom-right-radius: 0.5rem; min-height: 200px; }
                    .quill-dark .ql-stroke { stroke: hsl(var(--foreground)); }
                    .quill-dark .ql-fill { fill: hsl(var(--foreground)); }
                    .quill-dark .ql-picker { color: hsl(var(--foreground)); }
                    .quill-dark .ql-picker-options { background: hsl(var(--background)); border-color: hsl(var(--border)); }
                    .quill-dark .ql-editor { font-family: inherit; }
                  `}</style>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Cover Image</label>
                  <ImageUpload value={form.coverImage || ""} onChange={(url) => setForm({ ...form, coverImage: url })} placeholder="https://..." />
                </div>
                {/* ── Media & Attachments ── */}
                <div className="rounded-xl border border-border bg-muted/20 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                    <Paperclip className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold text-foreground">Media &amp; Attachments</span>
                    {(form.mediaAttachments?.length ?? 0) > 0 && (
                      <span className="ml-auto text-xs bg-primary/20 text-primary font-bold px-2 py-0.5 rounded-full">
                        {form.mediaAttachments!.length}
                      </span>
                    )}
                  </div>
                  <div className="p-4">
                    <MediaUploader
                      value={form.mediaAttachments || []}
                      onChange={(attachments) => setForm({ ...form, mediaAttachments: attachments })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Category</label>
                    <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputCls} placeholder="AI, Tech, etc." />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Read Time (min)</label>
                    <input type="number" min={1} value={form.readTime} onChange={(e) => setForm({ ...form, readTime: Number(e.target.value) })} className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Tags (comma-separated)</label>
                  <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} className={inputCls} placeholder="AI, Machine Learning, NLP" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as any })} className={inputCls}>
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="scheduled">Scheduled</option>
                  </select>
                </div>
                {form.status === "scheduled" && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" /> Publish Date & Time
                    </label>
                    <input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
                      className={inputCls} />
                  </div>
                )}
                <button type="submit" disabled={saving} className="w-full bg-primary text-primary-foreground rounded-lg py-3 text-sm font-semibold hover:opacity-90 disabled:opacity-60 transition-opacity">
                  {saving ? "Saving..." : editing ? "Update Post" : "Create Post"}
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

export default AdminBlog;
