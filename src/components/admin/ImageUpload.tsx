import { useState, useRef } from "react";
import { Upload, X, Loader2, Link as LinkIcon, Image as ImageIcon } from "lucide-react";
import { ENDPOINTS } from "@/lib/api";
import { authManager } from "@/lib/auth";

interface ImageUploadProps {
  value: string;
  onChange: (url: string) => void;
  className?: string;
  placeholder?: string;
}

export function ImageUpload({ value, onChange, className = "", placeholder = "https://..." }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [mode, setMode] = useState<"url" | "upload">("url");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", "suntrix");

    try {
      const token = authManager.getToken();
      const res = await fetch(ENDPOINTS.UPLOAD_IMAGE, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Upload failed");
      }

      const data = await res.json();
      onChange(data.url || data.secureUrl);
      setMode("url");
    } catch (err) {
      console.error(err);
      alert("Failed to upload image. Please try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center gap-2 mb-1">
        <button
          type="button"
          onClick={() => setMode("url")}
          className={`text-[10px] px-2 py-1 rounded flex items-center gap-1 font-medium transition-colors ${mode === "url" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
        >
          <LinkIcon className="w-3 h-3" /> URL
        </button>
        <button
          type="button"
          onClick={() => setMode("upload")}
          className={`text-[10px] px-2 py-1 rounded flex items-center gap-1 font-medium transition-colors ${mode === "upload" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
        >
          <Upload className="w-3 h-3" /> Upload
        </button>
      </div>

      {mode === "url" ? (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder={placeholder}
        />
      ) : (
        <div className="flex items-center gap-2">
          <input
            type="file"
            accept="image/*,video/*"
            ref={fileInputRef}
            onChange={handleUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full border-2 border-dashed border-border rounded-lg py-4 flex flex-col items-center justify-center gap-2 hover:border-primary/50 hover:bg-muted/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-card"
          >
            {uploading ? (
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
            ) : (
              <ImageIcon className="w-5 h-5 text-muted-foreground" />
            )}
            <span className="text-xs font-medium text-muted-foreground">
              {uploading ? "Uploading..." : "Click to select file (Image/Video)"}
            </span>
          </button>
        </div>
      )}

      {value && (
        <div className="relative inline-block mt-2 rounded-lg overflow-hidden border border-border bg-muted">
          <img src={value} alt="Preview" className="h-20 w-auto object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute top-1 right-1 bg-black/60 hover:bg-destructive text-white p-1 rounded-full transition-colors backdrop-blur-sm"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}
