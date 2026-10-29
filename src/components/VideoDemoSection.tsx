import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, X, Video } from "lucide-react";
import { apiRequest, ENDPOINTS } from "@/lib/api";

interface DemoVideo {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  videoUrl: string;
  duration: string;
  category: string;
}

const VideoDemoSection = () => {
  const [activeVideo, setActiveVideo] = useState<string | null>(null);
  const [demos, setDemos] = useState<DemoVideo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest<any[]>(ENDPOINTS.PORTFOLIO_LIST).then(({ data }) => {
      if (data) {
        const filtered = data
          .filter(p => p.status === "published" && p.featured && p.videoUrl)
          .map(p => ({
            id: p._id,
            title: p.title,
            description: p.shortDescription || p.description,
            thumbnail: p.thumbnailImage || p.coverImage || "/placeholder.svg",
            videoUrl: p.videoUrl,
            duration: p.metric || "3:00", // Fallback duration if metric used for it
            category: p.category
          }));
        setDemos(filtered);
      }
      setLoading(false);
    });
  }, []);

  if (!loading && demos.length === 0) return null;

  return (
    <section className="py-24 lg:py-32 relative">
      <div className="absolute inset-0 bg-grid-pattern opacity-30" />
      <div className="container mx-auto px-4 lg:px-8 relative z-10">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <span className="inline-block text-xs font-mono text-secondary uppercase tracking-widest mb-4">Video Demos</span>
          <h2 className="text-3xl lg:text-5xl font-display font-extrabold mb-4">
            See It In <span className="gradient-text">Action</span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Watch how our AI solutions work in real-world production environments.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6">
          {demos.map((demo, i) => (
            <motion.div
              key={demo.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="group cursor-pointer"
              onClick={() => setActiveVideo(demo.videoUrl)}
            >
              <div className="relative rounded-xl overflow-hidden border border-border bg-card hover:border-primary/40 transition-all duration-500 hover:shadow-[0_0_40px_hsl(24_100%_50%/0.12)]">
                {/* Thumbnail */}
                <div className="relative aspect-video overflow-hidden">
                  <img
                    src={demo.thumbnail}
                    alt={demo.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-background/30 group-hover:bg-background/10 transition-colors" />
                  {/* Play button */}
                  <motion.div
                    className="absolute inset-0 flex items-center justify-center"
                    whileHover={{ scale: 1.1 }}
                  >
                    <div className="h-16 w-16 rounded-full gradient-bg flex items-center justify-center shadow-lg group-hover:shadow-[0_0_30px_hsl(24_100%_50%/0.4)] transition-shadow">
                      <Play className="h-7 w-7 text-primary-foreground ml-1" />
                    </div>
                  </motion.div>
                  {/* Duration badge */}
                  <span className="absolute bottom-3 right-3 bg-background/80 backdrop-blur-sm rounded-md px-2 py-0.5 text-[10px] font-mono text-foreground">
                    {demo.duration}
                  </span>
                  {/* Category badge */}
                  <span className="absolute top-3 left-3 bg-primary/20 backdrop-blur-sm rounded-md px-2 py-0.5 text-[10px] font-mono text-primary">
                    {demo.category}
                  </span>
                </div>
                <div className="p-5">
                  <h3 className="text-sm font-bold text-foreground mb-1 group-hover:text-primary transition-colors">{demo.title}</h3>
                  <p className="text-xs text-muted-foreground">{demo.description}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Video Modal */}
      <AnimatePresence>
        {activeVideo && (
          <motion.div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 backdrop-blur-xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setActiveVideo(null)}
          >
            <motion.div
              className="relative w-full max-w-4xl mx-4 aspect-video rounded-2xl overflow-hidden border border-border shadow-2xl"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <iframe
                src={activeVideo}
                className="w-full h-full"
                allow="autoplay; fullscreen"
                allowFullScreen
              />
              <button
                onClick={() => setActiveVideo(null)}
                className="absolute top-4 right-4 h-10 w-10 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center text-foreground hover:bg-background transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
};

export default VideoDemoSection;
