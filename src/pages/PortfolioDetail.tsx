import { useParams, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, CheckCircle, ArrowRight, ChevronLeft, ChevronRight, Play } from "lucide-react";
import Layout from "@/components/Layout";
import { apiRequest, ENDPOINTS } from "@/lib/api";
import { PortfolioDetailSkeleton } from "@/components/skeletons";
import { safeHref } from "@/lib/sanitize";

const GallerySlider = ({ images }: { images: string[] }) => {
  const [current, setCurrent] = useState(0);

  const next = () => setCurrent((prev) => (prev + 1) % images.length);
  const prev = () => setCurrent((prev) => (prev - 1 + images.length) % images.length);

  return (
    <div className="relative rounded-2xl border border-border overflow-hidden bg-card shadow-lg group">
      <div className="aspect-video relative overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.img
            key={current}
            src={images[current]}
            alt={`Gallery ${current + 1}`}
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.4 }}
            className="w-full h-full object-cover"
          />
        </AnimatePresence>

        {images.length > 1 && (
          <>
            <button
              onClick={prev}
              className="absolute left-4 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-background/40 backdrop-blur-md flex items-center justify-center text-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:bg-background/60"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              onClick={next}
              className="absolute right-4 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-background/40 backdrop-blur-md flex items-center justify-center text-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:bg-background/60"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
              {images.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrent(i)}
                  className={`h-1.5 w-1.5 rounded-full transition-all ${
                    i === current ? "bg-primary w-4" : "bg-white/40"
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

interface PortfolioProject { _id: string; title: string; slug: string; category: string; description: string; metric: string; metricLabel: string; clientName: string; industry: string; coverImage: string; thumbnailImage: string; videoUrl: string; liveUrl: string; displayType: "video" | "images"; images: string[]; highlights: string[]; tools: { name: string; icon: string }[]; tags: string[]; }
interface CaseStudy { _id: string; challenge: string; solution: string; results: string; keyMetrics: { label: string; value: string; description: string }[]; }

const PortfolioDetail = () => {
  const { slug } = useParams();
  const [project, setProject] = useState<PortfolioProject | null>(null);
  const [caseStudy, setCaseStudy] = useState<CaseStudy | null>(null);
  const [related, setRelated] = useState<PortfolioProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!slug) return;
    // Ignore responses for a project the visitor has already navigated away from
    let stale = false;
    setLoading(true);
    setLoadError(null);
    apiRequest<PortfolioProject>(ENDPOINTS.PORTFOLIO_BY_SLUG(slug)).then(({ data: p, error, status }) => {
      if (stale) return;
      if (!p) {
        setProject(null);
        if (error && status !== 404) setLoadError(error);
        setLoading(false);
        return;
      }
      setProject(p);
      setLoading(false);
      // Fetch related projects
      apiRequest<PortfolioProject[]>(ENDPOINTS.PORTFOLIO_LIST).then(({ data: all }) => {
        if (!stale && Array.isArray(all)) setRelated(all.filter((r) => r.category === p.category && r._id !== p._id).slice(0, 3));
      });
    });
    return () => {
      stale = true;
    };
  }, [slug, attempt]);

  if (loading) return <PortfolioDetailSkeleton />;

  if (loadError) {
    return (
      <Layout>
        <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center px-6" role="alert">
          <p className="text-lg text-foreground">{loadError}</p>
          <button onClick={() => setAttempt((n) => n + 1)} className="text-primary underline hover:text-primary/90">
            Try again
          </button>
        </div>
      </Layout>
    );
  }

  if (!project) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground mb-4">Project Not Found</h1>
            <Link to="/work" className="text-primary hover:underline">← Back to Portfolio</Link>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Hero */}
      <section className="pt-32 pb-16 relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern opacity-30" />
        <div className="container mx-auto px-4 lg:px-8 relative z-10">
          <Link to="/work" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors mb-8">
            <ArrowLeft className="h-4 w-4" /> Back to Portfolio
          </Link>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl">
            <span className="inline-block rounded-full bg-primary/10 border border-primary/30 px-4 py-1 text-xs font-medium text-primary mb-6">
              {project.category}
            </span>
            <h1 className="text-3xl lg:text-5xl font-display font-extrabold mb-6">{project.title}</h1>
            <p className="text-lg text-muted-foreground leading-relaxed mb-8">{project.description}</p>

            <div className="flex flex-wrap items-center gap-8">
              <div className="flex flex-wrap gap-6">
                <div className="text-center">
                  <p className="text-3xl font-extrabold gradient-text">{project.metric}</p>
                  <p className="text-xs text-muted-foreground mt-1">{project.metricLabel}</p>
                </div>
                <div className="h-16 w-px bg-border" />
                <div>
                  <p className="text-sm font-medium text-foreground">{project.clientName}</p>
                  <p className="text-xs text-muted-foreground">{project.industry}</p>
                </div>
              </div>

              {project.liveUrl && (
                <a
                  href={safeHref(project.liveUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="gradient-bg inline-flex items-center gap-2 rounded-xl px-7 py-3.5 text-sm font-bold text-primary-foreground hover:shadow-[0_0_30px_hsl(24_100%_50%/0.3)] transition-all"
                >
                  Launch Project <ArrowRight className="h-4 w-4" />
                </a>
              )}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Media Section: Video or Premium Slider */}
      <section className="pb-16">
        <div className="container mx-auto px-4 lg:px-8">
          {project.displayType === "video" ? (
            project.videoUrl && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
              >
                <h2 className="text-2xl font-display font-bold mb-6">Project <span className="gradient-text">Demo</span></h2>
                <div className="rounded-2xl border border-border overflow-hidden bg-card shadow-lg">
                  <div className="aspect-video relative">
                    {project.videoUrl.includes("youtube.com") || project.videoUrl.includes("youtu.be") || project.videoUrl.includes("vimeo.com") ? (
                      <iframe
                        src={project.videoUrl}
                        className="w-full h-full"
                        allow="autoplay; fullscreen; encrypted-media"
                        allowFullScreen
                        title={`${project.title} Demo`}
                      />
                    ) : (
                      <video 
                        src={project.videoUrl} 
                        controls 
                        className="w-full h-full object-cover"
                        poster={project.coverImage}
                      />
                    )}
                  </div>
                </div>
              </motion.div>
            )
          ) : (
            project.images && project.images.filter(Boolean).length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="relative"
              >
                <h2 className="text-2xl font-display font-bold mb-6">Project <span className="gradient-text">Gallery</span></h2>
                <GallerySlider images={project.images.filter(Boolean)} />
              </motion.div>
            )
          )}

          {/* Fallback to Cover Image if no media specified */}
          {((project.displayType === "video" && !project.videoUrl) || 
            (project.displayType === "images" && (!project.images || project.images.filter(Boolean).length === 0))) && 
            project.coverImage && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="rounded-2xl border border-border overflow-hidden bg-card"
            >
              <img src={project.coverImage} alt={project.title} className="w-full aspect-video object-cover" />
            </motion.div>
          )}
        </div>
      </section>

      {/* Highlights & Tools */}
      <section className="pb-20">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12">
            <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
              <h2 className="text-2xl font-display font-bold mb-6">Key <span className="gradient-text">Highlights</span></h2>
              <div className="space-y-4">
                {project.highlights.map((h, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    className="flex items-start gap-3 p-4 rounded-xl border border-border bg-card hover:border-primary/30 transition-colors"
                  >
                    <CheckCircle className="h-5 w-5 text-success shrink-0 mt-0.5" />
                    <p className="text-sm text-foreground">{h}</p>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
              <h2 className="text-2xl font-display font-bold mb-6">Tools & <span className="gradient-text">Stack</span></h2>
              <div className="grid grid-cols-2 gap-3 mb-8">
                {project.tools.map((tool) => (
                  <div key={tool.name} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:border-primary/30 glow-hover transition-all">
                    <span className="text-2xl">{tool.icon}</span>
                    <span className="text-sm font-medium text-foreground">{tool.name}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {project.tags.map((tag) => (
                  <span key={tag} className="text-xs font-mono rounded-lg border border-border bg-muted px-3 py-1.5 text-muted-foreground">
                    {tag}
                  </span>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Case Study */}
      {caseStudy && (
        <section className="py-20 bg-card/30">
          <div className="container mx-auto px-4 lg:px-8">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="max-w-4xl mx-auto">
              <h2 className="text-3xl font-display font-extrabold mb-12 text-center">Case <span className="gradient-text">Study</span></h2>
              <div className="space-y-12">
                {[
                  { label: "Challenge", color: "destructive", content: caseStudy.challenge },
                  { label: "Solution", color: "primary", content: caseStudy.solution },
                  { label: "Results", color: "success", content: caseStudy.results },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl border border-border bg-card p-8">
                    <h3 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
                      <span className={`h-8 w-8 rounded-lg bg-${s.color}/10 flex items-center justify-center text-${s.color} text-sm font-bold`}>{s.label[0]}</span>
                      {s.label}
                    </h3>
                    <p className="text-muted-foreground leading-relaxed">{s.content}</p>
                  </div>
                ))}
                {caseStudy.keyMetrics.length > 0 && (
                  <div className="grid sm:grid-cols-3 gap-4">
                    {caseStudy.keyMetrics.map((m, i) => (
                      <div key={i} className="rounded-xl border border-border bg-card p-6 text-center">
                        <p className="text-2xl font-extrabold gradient-text mb-1">{m.value}</p>
                        <p className="text-sm font-medium text-foreground">{m.label}</p>
                        <p className="text-xs text-muted-foreground mt-1">{m.description}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </section>
      )}

      {/* Related */}
      {related.length > 0 && (
        <section className="py-20">
          <div className="container mx-auto px-4 lg:px-8">
            <h2 className="text-2xl font-display font-bold mb-8">Related <span className="gradient-text">Projects</span></h2>
            <div className="grid md:grid-cols-3 gap-6">
              {related.map((r) => (
                <Link key={r._id} to={`/work/${r.slug}`} className="group rounded-xl border border-border bg-card overflow-hidden hover:border-primary/30 glow-hover transition-all">
                  <div className="h-36 bg-gradient-to-br from-primary/10 to-transparent flex items-center justify-center">
                    <span className="text-2xl font-extrabold gradient-text">{r.metric}</span>
                  </div>
                  <div className="p-5">
                    <p className="text-xs text-primary font-medium mb-1">{r.category}</p>
                    <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{r.title}</h3>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="py-20 bg-card/30">
        <div className="container mx-auto px-4 lg:px-8 text-center">
          <h2 className="text-2xl font-display font-bold mb-4">Want Similar <span className="gradient-text">Results</span>?</h2>
          <p className="text-muted-foreground mb-8">Let's discuss how we can build something exceptional for your team.</p>
          <Link to="/request-task" className="gradient-bg inline-flex items-center gap-2 rounded-lg px-8 py-4 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-all hover:shadow-[0_0_30px_hsl(24_100%_50%/0.3)]">
            Request a Task <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </Layout>
  );
};

export default PortfolioDetail;
