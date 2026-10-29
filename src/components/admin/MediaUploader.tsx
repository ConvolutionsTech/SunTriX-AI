import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, X, FileText, Film, Image, Loader2, File } from "lucide-react";
import { ENDPOINTS, apiUpload } from "@/lib/api";
import { safeHref } from "@/lib/sanitize";

export interface MediaAttachment {
  url: string;
  type: "image" | "video" | "document";
  name: string;
  publicId: string;
  size?: number;
}

interface MediaUploaderProps {
  value: MediaAttachment[];
  onChange: (attachments: MediaAttachment[]) => void;
  accept?: string;
  maxItems?: number;
}

const DOC_EXTS = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt"];
const VIDEO_EXTS = [".mp4", ".mov", ".webm"];
const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"];

function getFileType(name: string): "image" | "video" | "document" {
  const ext = name.toLowerCase().slice(name.lastIndexOf("."));
  if (IMAGE_EXTS.includes(ext)) return "image";
  if (VIDEO_EXTS.includes(ext)) return "video";
  return "document";
}

function formatBytes(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DocIcon({ ext }: { ext: string }) {
  const e = ext.toLowerCase();
  const color =
    e === "pdf" ? "text-red-400" :
    e === "doc" || e === "docx" ? "text-blue-400" :
    e === "xls" || e === "xlsx" ? "text-emerald-400" :
    e === "ppt" || e === "pptx" ? "text-orange-400" :
    "text-muted-foreground";
  return <FileText className={`h-8 w-8 ${color}`} />;
}

export const MediaUploader = ({ value, onChange, maxItems = 20 }: MediaUploaderProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const uploadFile = async (file: File): Promise<MediaAttachment | null> => {
    const type = getFileType(file.name);

    let endpoint: string = ENDPOINTS.UPLOAD_IMAGE;
    if (type === "video") endpoint = ENDPOINTS.UPLOAD_VIDEO;
    else if (type === "document") endpoint = ENDPOINTS.UPLOAD_DOCUMENT;

    const formData = new FormData();
    formData.append("file", file);

    const { data, error } = await apiUpload<{ url?: string; secureUrl?: string; publicId?: string; _id?: string }>(endpoint, formData);
    if (error || !data) throw new Error(error || "Upload failed");
    return {
      url: data.url || data.secureUrl,
      type,
      name: file.name,
      publicId: data.publicId || data._id || "",
      size: file.size,
    };
  };

  const handleFiles = async (files: FileList | File[]) => {
    const fileArr = Array.from(files);
    const remaining = maxItems - value.length;
    if (remaining <= 0) {
      setErrors([`Maximum ${maxItems} attachments allowed.`]);
      return;
    }
    const toProcess = fileArr.slice(0, remaining);
    setErrors([]);
    setUploading(true);

    const results: MediaAttachment[] = [];
    const errs: string[] = [];
    for (const file of toProcess) {
      try {
        const att = await uploadFile(file);
        if (att) results.push(att);
      } catch (e) {
        errs.push(`${file.name}: ${e instanceof Error ? e.message : "Failed"}`);
      }
    }

    setUploading(false);
    if (errs.length) setErrors(errs);
    if (results.length) onChange([...value, ...results]);
  };

  const remove = (idx: number) => {
    const next = [...value];
    next.splice(idx, 1);
    onChange(next);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed cursor-pointer transition-all px-4 py-6
          ${dragOver
            ? "border-primary bg-primary/10 scale-[1.01]"
            : "border-border bg-muted/30 hover:border-primary/50 hover:bg-muted/50"
          }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
        {uploading ? (
          <Loader2 className="h-7 w-7 text-primary animate-spin" />
        ) : (
          <Upload className={`h-7 w-7 ${dragOver ? "text-primary" : "text-muted-foreground"}`} />
        )}
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">
            {uploading ? "Uploading…" : "Drop files or click to browse"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Images · Videos · PDF · DOC · XLS · PPT · up to 50 MB each
          </p>
        </div>
        {/* Type badges */}
        <div className="flex items-center gap-2 mt-1">
          {[
            { icon: Image, label: "Images", color: "text-blue-400 bg-blue-500/10" },
            { icon: Film, label: "Videos", color: "text-purple-400 bg-purple-500/10" },
            { icon: File, label: "Docs", color: "text-amber-400 bg-amber-500/10" },
          ].map(({ icon: Icon, label, color }) => (
            <span key={label} className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${color}`}>
              <Icon className="h-3 w-3" /> {label}
            </span>
          ))}
        </div>
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 space-y-1">
          {errors.map((e, i) => (
            <p key={i} className="text-xs text-destructive">{e}</p>
          ))}
        </div>
      )}

      {/* Attachment Grid */}
      {value.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <AnimatePresence>
            {value.map((att, idx) => (
              <motion.div
                key={`${att.url}-${idx}`}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                className="relative group rounded-lg border border-border bg-muted/30 overflow-hidden"
              >
                {/* Preview */}
                {att.type === "image" && (
                  <img
                    src={att.url}
                    alt={att.name}
                    className="w-full h-24 object-cover"
                  />
                )}
                {att.type === "video" && (
                  <video
                    src={att.url}
                    className="w-full h-24 object-cover"
                    muted
                  />
                )}
                {att.type === "document" && (
                  <a
                    href={safeHref(att.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-col items-center justify-center h-24 gap-2 hover:bg-muted/60 transition-colors"
                  >
                    <DocIcon ext={att.name.split(".").pop() || ""} />
                    <span className="text-[10px] uppercase font-bold text-muted-foreground px-1">
                      {att.name.split(".").pop()}
                    </span>
                  </a>
                )}

                {/* File name + size */}
                <div className="px-2 py-1.5 border-t border-border">
                  <p className="text-[10px] text-foreground truncate leading-tight">{att.name}</p>
                  {att.size && (
                    <p className="text-[9px] text-muted-foreground">{formatBytes(att.size)}</p>
                  )}
                </div>

                {/* Remove button */}
                <button
                  type="button"
                  onClick={() => remove(idx)}
                  className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive"
                >
                  <X className="h-3 w-3" />
                </button>

                {/* Type badge */}
                <span className={`absolute top-1 left-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full capitalize
                  ${att.type === "image" ? "bg-blue-500/80 text-white" :
                    att.type === "video" ? "bg-purple-500/80 text-white" :
                    "bg-amber-500/80 text-white"}`}>
                  {att.type === "document" ? att.name.split(".").pop()?.toUpperCase() : att.type}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {value.length > 0 && (
        <p className="text-xs text-muted-foreground text-right">
          {value.length} / {maxItems} attachment{value.length !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
};

export default MediaUploader;
