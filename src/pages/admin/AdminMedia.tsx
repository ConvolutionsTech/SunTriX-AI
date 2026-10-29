import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest, ENDPOINTS, apiUpload } from "@/lib/api";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminDataTable } from "@/components/admin/AdminDataTable";
import { safeHref } from "@/lib/sanitize";
import {
  Upload, Trash2, Search, Copy, Check, Image, Film, FileText,
  Grid3X3, List, X, ExternalLink, Eye, ArrowUpDown, Filter,
  CheckSquare, Square, Download, Folder, Sparkles, AlertCircle
} from "lucide-react";

type AssetCategory = "all" | "image" | "video" | "document";

interface Asset {
  _id: string;
  publicId: string;
  url: string;
  secureUrl?: string;
  thumbnailUrl?: string;
  name: string;
  type: "image" | "video" | "document";
  resourceType?: string;
  format?: string;
  size?: number;
  bytes?: number;
  width?: number;
  height?: number;
  createdAt?: string;
  folder?: string;
}

const formatBytes = (bytes?: number) => {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const AdminMedia = () => {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<AssetCategory>("all");
  const [sortOption, setSortOption] = useState<"newest" | "oldest" | "size" | "name">("newest");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showUploadDropzone, setShowUploadDropzone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAssets = async () => {
    setLoading(true);
    const { data } = await apiRequest<any[]>(ENDPOINTS.UPLOAD_LIST);
    if (data) {
      setAssets(
        data.map((d) => ({
          ...d,
          name: d.publicId?.split("/").pop() || d.publicId,
          type: d.resourceType === "video" ? "video" : d.resourceType === "raw" ? "document" : "image",
          size: d.bytes || 0,
        }))
      );
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAssets();
  }, []);

  const handleUploadFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;
    setUploading(true);
    const failures: string[] = [];

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      setUploadProgress(`Uploading (${i + 1}/${fileArray.length}): ${file.name}`);
      const formData = new FormData();
      formData.append("file", file);
      const isVideo = file.type.startsWith("video/") || [".mp4", ".mov", ".webm", ".avi", ".mkv"].some((ext) => file.name.toLowerCase().endsWith(ext));
      const isDoc = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt"].some((ext) => file.name.toLowerCase().endsWith(ext));
      const endpoint = isVideo ? ENDPOINTS.UPLOAD_VIDEO : isDoc ? ENDPOINTS.UPLOAD_DOCUMENT : ENDPOINTS.UPLOAD_IMAGE;

      const { error } = await apiUpload(endpoint, formData);
      if (error) failures.push(`${file.name}: ${error}`);
    }

    if (failures.length) alert(`Some files could not be uploaded:\n${failures.join("\n")}`);
    setUploading(false);
    setUploadProgress("");
    setShowUploadDropzone(false);
    fetchAssets();
  };

  const handleDelete = async (publicId: string) => {
    if (!window.confirm("Delete this digital asset permanently from Cloudinary?")) return;
    await apiRequest(ENDPOINTS.UPLOAD_DELETE(publicId), { method: "DELETE" });
    if (selectedAsset?.publicId === publicId) setSelectedAsset(null);
    fetchAssets();
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedIds.size} selected assets permanently?`)) return;
    const toDelete = assets.filter((a) => selectedIds.has(a._id));
    for (const a of toDelete) {
      await apiRequest(ENDPOINTS.UPLOAD_DELETE(a.publicId), { method: "DELETE" });
    }
    setSelectedIds(new Set());
    fetchAssets();
  };

  const handleCopy = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleBulkCopyUrls = () => {
    const urls = assets.filter((a) => selectedIds.has(a._id)).map((a) => a.url).join("\n");
    navigator.clipboard.writeText(urls);
    alert(`${selectedIds.size} URLs copied to clipboard!`);
  };

  const toggleSelectAsset = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const filteredAssets = useMemo(() => {
    return assets
      .filter((a) => {
        const matchesCategory = category === "all" ? true : a.type === category;
        const matchesSearch = !search || a.name.toLowerCase().includes(search.toLowerCase()) || a.publicId.toLowerCase().includes(search.toLowerCase());
        return matchesCategory && matchesSearch;
      })
      .sort((a, b) => {
        if (sortOption === "newest") return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        if (sortOption === "oldest") return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
        if (sortOption === "size") return (b.size || 0) - (a.size || 0);
        if (sortOption === "name") return a.name.localeCompare(b.name);
        return 0;
      });
  }, [assets, category, search, sortOption]);

  const tabsWithCounts = [
    { id: "all", label: "All Assets", count: assets.length },
    { id: "image", label: "Images", count: assets.filter((a) => a.type === "image").length },
    { id: "video", label: "Videos", count: assets.filter((a) => a.type === "video").length },
    { id: "document", label: "Documents", count: assets.filter((a) => a.type === "document").length },
  ];

  return (
    <div className="space-y-6 font-sans">
      <input
        type="file"
        ref={fileInputRef}
        multiple
        onChange={(e) => e.target.files && handleUploadFiles(e.target.files)}
        className="hidden"
      />

      {/* Header */}
      <AdminPageHeader
        title="Media & Digital Asset Workspace"
        description="Centralized Cloudinary asset library: high-resolution media, demo videos, and client deliverables."
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowUploadDropzone(!showUploadDropzone)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold shadow-md hover:bg-primary/90 transition-all"
            >
              <Upload className="h-4 w-4" />
              {uploading ? "Uploading…" : "Upload Media"}
            </button>
          </div>
        }
      />

      {/* DRAG AND DROP UPLOAD ZONE MODAL / EXPANDABLE PANEL */}
      <AnimatePresence>
        {showUploadDropzone && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files) handleUploadFiles(e.dataTransfer.files);
              }}
              className="p-8 border-2 border-dashed border-primary/40 rounded-2xl bg-primary/5 hover:bg-primary/10 transition-colors text-center space-y-3 relative group"
            >
              <button
                onClick={() => setShowUploadDropzone(false)}
                className="absolute top-3 right-3 p-1.5 rounded-lg bg-background/80 hover:bg-background text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="mx-auto w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                <Upload className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">Drag and drop media files here</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Supports high-res PNG, JPG, WebP, MP4, MOV, WebM, PDF, and Office documents</p>
              </div>

              {uploading ? (
                <div className="max-w-md mx-auto space-y-2 pt-2">
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary animate-pulse w-3/4" />
                  </div>
                  <p className="text-xs font-mono font-medium text-primary">{uploadProgress}</p>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold shadow-xs"
                >
                  Browse Files from Computer
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FILTER & TOOLBAR BAR */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-card border border-border/50 rounded-xl shadow-2xs text-xs">
        {/* Category Tabs */}
        <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg border border-border/40">
          {tabsWithCounts.map((t) => {
            const isActive = category === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setCategory(t.id as AssetCategory)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  isActive
                    ? "bg-background text-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span>{t.label}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-muted text-muted-foreground font-bold">
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search, Sort, and View Mode */}
        <div className="flex flex-wrap items-center gap-2.5 flex-1 justify-end">
          <div className="relative min-w-[200px] max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search filename or ID…"
              className="w-full bg-background border border-border/60 rounded-lg pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as any)}
              className="bg-background border border-border/60 rounded-lg px-2.5 py-1.5 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="newest">Sort: Newest First</option>
              <option value="oldest">Sort: Oldest First</option>
              <option value="size">Sort: Size Largest</option>
              <option value="name">Sort: Name A-Z</option>
            </select>
          </div>

          <div className="flex items-center bg-muted/60 border border-border/60 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-md transition-all ${
                viewMode === "grid" ? "bg-background text-foreground shadow-2xs" : "text-muted-foreground hover:text-foreground"
              }`}
              title="Grid View"
            >
              <Grid3X3 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded-md transition-all ${
                viewMode === "list" ? "bg-background text-foreground shadow-2xs" : "text-muted-foreground hover:text-foreground"
              }`}
              title="List View"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* FLOATING BULK SELECTION BAR */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-zinc-900 text-white px-5 py-3 rounded-2xl shadow-2xl border border-zinc-700 flex items-center gap-4 text-xs"
          >
            <div className="font-semibold flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-[10px]">
                {selectedIds.size}
              </span>
              <span>assets selected</span>
            </div>

            <div className="h-4 w-[1px] bg-zinc-700" />

            <button
              onClick={handleBulkCopyUrls}
              className="hover:text-primary transition-colors flex items-center gap-1.5 font-medium"
            >
              <Copy className="h-3.5 w-3.5" /> Copy URLs
            </button>

            <button
              onClick={handleBulkDelete}
              className="text-red-400 hover:text-red-300 transition-colors flex items-center gap-1.5 font-medium"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete Selected
            </button>

            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-zinc-400 hover:text-white transition-colors ml-2"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MAIN ASSET RENDERER */}
      {loading ? (
        <div className="p-12 text-center space-y-3">
          <div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
          <p className="text-xs text-muted-foreground font-mono">Loading digital assets from Cloudinary…</p>
        </div>
      ) : filteredAssets.length === 0 ? (
        <div className="p-16 text-center border-2 border-dashed border-border/60 rounded-2xl bg-card/40 space-y-4 max-w-lg mx-auto my-8">
          <div className="w-12 h-12 rounded-2xl bg-muted text-muted-foreground flex items-center justify-center mx-auto">
            <Image className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Your media library is empty</h3>
            <p className="text-xs text-muted-foreground mt-1">Upload images, videos, and documents to manage reusable assets across SunTriX.</p>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold shadow-xs"
          >
            Upload Media Now
          </button>
        </div>
      ) : viewMode === "grid" ? (
        /* GRID VIEW */
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {filteredAssets.map((asset) => {
            const isSelected = selectedIds.has(asset._id);

            return (
              <motion.div
                key={asset._id}
                whileHover={{ y: -3 }}
                onClick={() => setSelectedAsset(asset)}
                className={`group relative rounded-xl border bg-card overflow-hidden transition-all flex flex-col justify-between cursor-pointer shadow-2xs ${
                  isSelected ? "border-primary ring-2 ring-primary/20" : "border-border/60 hover:border-primary/50"
                }`}
              >
                {/* Checkbox Trigger */}
                <button
                  onClick={(e) => toggleSelectAsset(asset._id, e)}
                  className={`absolute top-2.5 left-2.5 z-10 p-1 rounded-md transition-colors ${
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "bg-black/40 text-white/70 opacity-0 group-hover:opacity-100 hover:bg-black/60"
                  }`}
                >
                  {isSelected ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                </button>

                {/* Type Badge */}
                <div className="absolute top-2.5 right-2.5 z-10 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-[9px] font-mono font-bold text-white uppercase flex items-center gap-1">
                  {asset.type === "image" && <Image className="h-2.5 w-2.5 text-blue-400" />}
                  {asset.type === "video" && <Film className="h-2.5 w-2.5 text-purple-400" />}
                  {asset.type === "document" && <FileText className="h-2.5 w-2.5 text-amber-400" />}
                  <span>{asset.type}</span>
                </div>

                {/* Preview Container */}
                <div className="aspect-square bg-muted/30 flex items-center justify-center overflow-hidden relative">
                  {asset.type === "image" ? (
                    <img
                      src={asset.url}
                      alt={asset.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : asset.type === "video" ? (
                    <div className="w-full h-full relative flex items-center justify-center bg-zinc-950">
                      <video src={asset.url} className="w-full h-full object-cover opacity-80" />
                      <div className="w-8 h-8 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center text-white">
                        <Film className="h-4 w-4 text-purple-400" />
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-center p-4">
                      <FileText className="h-10 w-10 text-primary/70 mb-2" />
                      <span className="text-[10px] font-mono text-muted-foreground uppercase font-bold">
                        {asset.format || "DOC"}
                      </span>
                    </div>
                  )}

                  {/* Contextual Hover Actions */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelectedAsset(asset); }}
                      className="p-2 rounded-lg bg-card/90 text-foreground hover:bg-card transition-colors shadow-xs"
                      title="Inspect Asset"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleCopy(asset.url, asset._id); }}
                      className="p-2 rounded-lg bg-card/90 text-foreground hover:bg-card transition-colors shadow-xs"
                      title="Copy URL"
                    >
                      {copiedId === asset._id ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                    <a
                      href={safeHref(asset.url)}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-2 rounded-lg bg-card/90 text-foreground hover:bg-card transition-colors shadow-xs"
                      title="Open asset"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(asset.publicId); }}
                      className="p-2 rounded-lg bg-destructive/90 text-white hover:bg-destructive transition-colors shadow-xs"
                      title="Delete asset"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Footer Metadata */}
                <div className="p-2.5 bg-card border-t border-border/60">
                  <p className="text-[11px] font-semibold text-foreground truncate">{asset.name}</p>
                  <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                    {asset.size ? formatBytes(asset.size) : "Cloudinary Asset"}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : (
        /* TABLE LIST VIEW */
        <div className="border border-border/60 rounded-xl bg-card overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 border-b border-border/40 text-muted-foreground font-mono uppercase text-[10px]">
              <tr>
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === filteredAssets.length && filteredAssets.length > 0}
                    onChange={() => {
                      if (selectedIds.size === filteredAssets.length) setSelectedIds(new Set());
                      else setSelectedIds(new Set(filteredAssets.map((a) => a._id)));
                    }}
                    className="rounded border-border"
                  />
                </th>
                <th className="px-4 py-3">Asset</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">File Size</th>
                <th className="px-4 py-3">Dimensions</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filteredAssets.map((asset) => {
                const isSelected = selectedIds.has(asset._id);

                return (
                  <tr
                    key={asset._id}
                    onClick={() => setSelectedAsset(asset)}
                    className="hover:bg-muted/40 transition-colors cursor-pointer group"
                  >
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => toggleSelectAsset(asset._id)}
                        className="rounded border-border"
                      />
                    </td>
                    <td className="px-4 py-3 font-semibold text-foreground flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center overflow-hidden shrink-0 border border-border/40">
                        {asset.type === "image" ? (
                          <img src={asset.url} alt="" className="w-full h-full object-cover" />
                        ) : asset.type === "video" ? (
                          <Film className="h-4 w-4 text-purple-400" />
                        ) : (
                          <FileText className="h-4 w-4 text-amber-400" />
                        )}
                      </div>
                      <span className="truncate max-w-xs group-hover:text-primary transition-colors">{asset.name}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-muted-foreground uppercase">{asset.type}</td>
                    <td className="px-4 py-3 font-mono text-muted-foreground">{formatBytes(asset.size)}</td>
                    <td className="px-4 py-3 font-mono text-muted-foreground">
                      {asset.width && asset.height ? `${asset.width}x${asset.height}` : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-muted-foreground">
                      {asset.createdAt ? new Date(asset.createdAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleCopy(asset.url, asset._id)}
                          className="px-2 py-1 rounded bg-muted hover:bg-primary hover:text-primary-foreground text-xs font-mono transition-all"
                        >
                          {copiedId === asset._id ? "Copied!" : "Copy URL"}
                        </button>
                        <button
                          onClick={() => handleDelete(asset.publicId)}
                          className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ASSET DETAIL DRAWER SLIDE-OVER */}
      <AnimatePresence>
        {selectedAsset && (
          <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-xs flex justify-end">
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="w-full max-w-md bg-card border-l border-border h-full shadow-2xl flex flex-col justify-between overflow-y-auto p-6 space-y-6"
            >
              {/* Drawer Header */}
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div>
                  <h3 className="text-sm font-bold text-foreground font-display truncate max-w-[280px]">
                    {selectedAsset.name}
                  </h3>
                  <p className="text-[11px] text-muted-foreground font-mono uppercase mt-0.5">
                    {selectedAsset.type} Asset Details
                  </p>
                </div>
                <button
                  onClick={() => setSelectedAsset(null)}
                  className="p-1.5 rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Large Preview Player / Viewer */}
              <div className="rounded-xl border border-border/60 bg-muted/40 overflow-hidden flex items-center justify-center min-h-[220px] max-h-[300px] relative">
                {selectedAsset.type === "image" ? (
                  <img src={selectedAsset.url} alt="" className="w-full h-full object-contain" />
                ) : selectedAsset.type === "video" ? (
                  <video src={selectedAsset.url} controls className="w-full h-full object-contain" />
                ) : (
                  <div className="p-8 text-center space-y-2">
                    <FileText className="h-16 w-16 text-primary mx-auto" />
                    <p className="text-xs font-bold text-foreground">{selectedAsset.name}</p>
                    <p className="text-[11px] font-mono text-muted-foreground">{formatBytes(selectedAsset.size)}</p>
                  </div>
                )}
              </div>

              {/* Metadata Panel */}
              <div className="space-y-3 bg-muted/20 border border-border/40 rounded-xl p-4 text-xs font-mono">
                <h4 className="font-bold text-foreground uppercase tracking-wider text-[10px]">Asset Metadata</h4>
                <div className="space-y-2 divide-y divide-border/30">
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">Public ID:</span>
                    <span className="text-foreground font-bold truncate max-w-[200px]">{selectedAsset.publicId}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">Type:</span>
                    <span className="text-foreground uppercase font-bold">{selectedAsset.type}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">Size:</span>
                    <span className="text-foreground font-bold">{formatBytes(selectedAsset.size)}</span>
                  </div>
                  {selectedAsset.width && selectedAsset.height && (
                    <div className="flex justify-between py-1">
                      <span className="text-muted-foreground">Dimensions:</span>
                      <span className="text-foreground font-bold">{selectedAsset.width} x {selectedAsset.height} px</span>
                    </div>
                  )}
                  {selectedAsset.createdAt && (
                    <div className="flex justify-between py-1">
                      <span className="text-muted-foreground">Uploaded:</span>
                      <span className="text-foreground">{new Date(selectedAsset.createdAt).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Direct Actions */}
              <div className="space-y-2 pt-4 border-t border-border">
                <button
                  onClick={() => handleCopy(selectedAsset.url, selectedAsset._id)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold shadow-xs hover:bg-primary/90 transition-all"
                >
                  {copiedId === selectedAsset._id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  <span>{copiedId === selectedAsset._id ? "URL Copied to Clipboard!" : "Copy Public URL"}</span>
                </button>

                <a
                  href={safeHref(selectedAsset.url)}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-border/60 bg-background text-foreground text-xs font-semibold hover:bg-muted transition-all"
                >
                  <ExternalLink className="h-4 w-4" /> Open Full Asset in New Tab
                </a>

                <button
                  onClick={() => handleDelete(selectedAsset.publicId)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-500 text-xs font-semibold hover:bg-red-500/20 transition-all"
                >
                  <Trash2 className="h-4 w-4" /> Delete Asset Permanently
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminMedia;
