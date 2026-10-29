import { motion, AnimatePresence } from "framer-motion";
import { X, Monitor, ExternalLink, ArrowRight, Play, Star } from "lucide-react";
import { safeHref } from "@/lib/sanitize";

// ─── Types ────────────────────────────────────────────────────────
interface PortfolioPreviewData {
  type: "portfolio";
  title: string;
  category: string;
  shortDescription: string;
  metric: string;
  metricLabel: string;
  coverImage: string;
  thumbnailImage: string;
  videoUrl: string;
  liveUrl: string;
  tags: string[];
  tools: { name: string; icon: string }[];
  highlights: string[];
  status: string;
  featured: boolean;
  displayType: "video" | "images";
  images: string[];
}

interface DepartmentPreviewData {
  type: "department";
  name: string;
  subtitle: string;
  description: string;
  image: string;
  href: string;
  capabilities: string[];
  enabled: boolean;
}

export type PreviewData = PortfolioPreviewData | DepartmentPreviewData;

// ─── Portfolio Card Preview ────────────────────────────────────────
const PortfolioCardPreview = ({ data }: { data: PortfolioPreviewData }) => {
  const cover = data.thumbnailImage || data.coverImage || "";
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-lg">
      {/* Image area */}
      <div className="h-44 bg-gradient-to-br from-primary/10 via-secondary/5 to-transparent relative overflow-hidden">
        {cover ? (
          <img src={cover} alt={data.title || "Preview"} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-3xl font-extrabold bg-gradient-to-r from-orange-400 to-amber-300 bg-clip-text text-transparent">
              {data.metric || "—"}
            </span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent" />
        {/* Badges */}
        <div className="absolute top-2 right-2 flex gap-1">
          <span className={`text-[10px] rounded-full px-2 py-0.5 font-medium ${
            data.status === "published" ? "bg-green-500/20 text-green-400" : "bg-muted text-muted-foreground"
          }`}>{data.status || "draft"}</span>
          {data.featured && <span className="text-[10px] rounded-full bg-amber-400/20 text-amber-400 px-2 py-0.5 font-medium">★ Featured</span>}
        </div>
        {/* Video indicator */}
        {data.videoUrl && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-10 w-10 rounded-full bg-primary/80 flex items-center justify-center shadow-lg">
              <Play className="h-4 w-4 text-white ml-0.5" />
            </div>
          </div>
        )}
        <div className="absolute bottom-3 left-4">
          {data.metric && <span className="text-xl font-extrabold bg-gradient-to-r from-orange-400 to-amber-300 bg-clip-text text-transparent">{data.metric}</span>}
          {data.metricLabel && <p className="text-[10px] text-muted-foreground">{data.metricLabel}</p>}
        </div>
      </div>

      <div className="p-4">
        {data.category && (
          <span className="inline-block rounded-full bg-secondary/15 border border-secondary/20 px-2.5 py-0.5 text-[10px] font-bold text-orange-400 uppercase tracking-wider mb-2">{data.category}</span>
        )}
        <h3 className="text-sm font-bold text-foreground mb-1 leading-tight">{data.title || "Project Title"}</h3>
        <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{data.shortDescription || "Short description appears here..."}</p>
        {data.tools && data.tools.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {data.tools.slice(0, 4).map((t, i) => (
              <span key={i} className="text-[10px] font-mono text-muted-foreground bg-muted rounded px-1.5 py-0.5">{t.icon} {t.name}</span>
            ))}
          </div>
        )}
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
          View Case Study <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </div>
  );
};

// ─── Portfolio Detail Hero Preview ────────────────────────────────
const PortfolioDetailPreview = ({ data }: { data: PortfolioPreviewData }) => {
  const cover = data.coverImage || data.thumbnailImage || "";
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden text-xs">
      {/* Mini hero */}
      <div className="p-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="inline-block rounded-full bg-primary/10 border border-primary/30 px-2 py-0.5 text-[10px] font-medium text-primary">{data.category || "Category"}</span>
        </div>
        <h4 className="font-bold text-foreground text-sm leading-tight mb-1">{data.title || "Project Title"}</h4>
        <p className="text-[10px] text-muted-foreground line-clamp-2">{data.shortDescription || "Description..."}</p>
        <div className="flex gap-2 mt-2">
          <span className="text-[10px] rounded-md bg-primary px-2 py-1 text-primary-foreground font-semibold">View Live</span>
          {data.liveUrl && <span className="text-[10px] rounded-md border border-border px-2 py-1 text-muted-foreground">Open ↗</span>}
        </div>
      </div>

      {/* Media block */}
      {data.displayType === "images" && data.images && data.images.filter(Boolean).length > 0 ? (
        <div className="relative aspect-video bg-muted overflow-hidden">
          <img src={data.images.filter(Boolean)[0]} alt="Gallery" className="w-full h-full object-cover" />
          {data.images.filter(Boolean).length > 1 && (
            <div className="absolute bottom-1 right-2 text-[9px] bg-background/80 backdrop-blur-sm rounded px-1.5 py-0.5 text-foreground font-medium">
              1 / {data.images.filter(Boolean).length}
            </div>
          )}
        </div>
      ) : cover ? (
        <div className="aspect-video bg-muted relative overflow-hidden">
          <img src={cover} alt={data.title} className="w-full h-full object-cover" />
          {data.videoUrl && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <div className="h-8 w-8 rounded-full bg-primary/90 flex items-center justify-center">
                <Play className="h-3 w-3 text-white ml-0.5" />
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="aspect-video bg-gradient-to-br from-primary/10 to-secondary/5 flex items-center justify-center">
          <span className="text-xs text-muted-foreground">No media yet</span>
        </div>
      )}

      {/* Highlights */}
      {data.highlights && data.highlights.length > 0 && (
        <div className="p-3 space-y-1">
          {data.highlights.slice(0, 3).map((h, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
              <span className="text-[10px] text-muted-foreground">{h}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Department Card Preview ───────────────────────────────────────
const DepartmentCardPreview = ({ data }: { data: DepartmentPreviewData }) => (
  <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-lg">
    <div className="relative h-44 overflow-hidden bg-muted">
      {data.image ? (
        <img src={data.image} alt={data.name || "Dept"} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-primary/10 to-secondary/5" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />
      <p className="absolute bottom-3 left-4 text-base font-bold text-foreground">{data.name || "Department Name"}</p>
    </div>
    <div className="p-4">
      <p className="text-[10px] font-semibold text-primary mb-1.5">{data.subtitle || "Subtitle"}</p>
      <p className="text-[10px] text-muted-foreground leading-relaxed mb-3 line-clamp-2">{data.description || "Description appears here..."}</p>
      {data.capabilities && data.capabilities.length > 0 && (
        <div className="space-y-1 mb-3">
          {data.capabilities.slice(0, 3).map((c, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="h-1 w-1 rounded-full bg-primary shrink-0" />
              <span className="text-[9px] text-muted-foreground">{c}</span>
            </div>
          ))}
        </div>
      )}
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary">
        Explore <ArrowRight className="h-2.5 w-2.5" />
      </span>
    </div>
  </div>
);

// ─── Main LivePreview Panel ────────────────────────────────────────
interface LivePreviewProps {
  data: PreviewData | null;
  onClose: () => void;
}

const LivePreview = ({ data, onClose }: LivePreviewProps) => {
  return (
    <AnimatePresence>
      {data && (
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 40 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="fixed right-0 top-0 h-full w-[380px] z-[60] border-l border-border bg-background/95 backdrop-blur-xl shadow-2xl overflow-y-auto"
        >
          {/* Header */}
          <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-border bg-background/95 backdrop-blur-md">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center">
                <Monitor className="h-3.5 w-3.5 text-primary" />
              </div>
              <div>
                <p className="text-xs font-bold text-foreground">Live Preview</p>
                <p className="text-[10px] text-muted-foreground">As it appears on your website</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-5 space-y-6">
            {data.type === "portfolio" && (
              <>
                {/* Section label */}
                <div>
                  <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
                    <span className="h-px flex-1 bg-border" />
                    Portfolio Grid Card
                    <span className="h-px flex-1 bg-border" />
                  </p>
                  <PortfolioCardPreview data={data} />
                </div>

                <div>
                  <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
                    <span className="h-px flex-1 bg-border" />
                    Project Detail Page
                    <span className="h-px flex-1 bg-border" />
                  </p>
                  <PortfolioDetailPreview data={data} />
                </div>

                {/* Tags preview */}
                {data.tags && data.tags.length > 0 && (
                  <div>
                    <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-2">Tags</p>
                    <div className="flex flex-wrap gap-1.5">
                      {data.tags.map((t, i) => (
                        <span key={i} className="text-[10px] rounded-full border border-border px-2 py-0.5 text-muted-foreground">{t}</span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {data.type === "department" && (
              <>
                <div>
                  <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
                    <span className="h-px flex-1 bg-border" />
                    Homepage Department Card
                    <span className="h-px flex-1 bg-border" />
                  </p>
                  <DepartmentCardPreview data={data} />
                </div>

                {/* Capabilities */}
                {data.capabilities && data.capabilities.length > 0 && (
                  <div>
                    <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-2">All Capabilities</p>
                    <div className="space-y-1">
                      {data.capabilities.map((c, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                          <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                          {c}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-[10px] font-mono text-muted-foreground mb-1.5">Route Preview</p>
                  <a href={safeHref(data.href)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    {data.href || "/services/..."} <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </>
            )}

            {/* Watermark */}
            <div className="text-center pt-4 border-t border-border">
              <p className="text-[10px] text-muted-foreground/50 font-mono">SunTriX Admin • Live Preview</p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default LivePreview;
export type { PortfolioPreviewData, DepartmentPreviewData };
