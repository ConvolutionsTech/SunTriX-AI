import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link, useParams, useNavigate } from "react-router-dom";
import { apiRequest, ENDPOINTS } from "../lib/api";
import { useSEO } from "../hooks/useSEO";
import Layout from "../components/Layout";
import { Clock, Tag, ArrowLeft, Calendar, User, ChevronRight, Share2, Copy, Check, FileText, Download, Eye } from "lucide-react";
import { safeHref, sanitizeHtml } from "@/lib/sanitize";

interface BlogPost {
  _id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  coverImage?: string;
  tags: string[];
  category: string;
  status: string;
  publishedAt?: string;
  readTime?: number;
  author?: string;
  createdAt: string;
  mediaAttachments?: {
    url: string;
    type: string;
    name: string;
    size: number;
    publicId: string;
  }[];
}

const formatBytes = (bytes: number, decimals = 2) => {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

// Minimal markdown → HTML renderer. Its output (and any stored HTML) is untrusted —
// always pass it through sanitizeHtml before rendering.
const renderMarkdown = (md: string): string => {
  if (!md) return "";
  // If the content is already HTML (from Quill), return it directly
  if (/<[a-z][\s\S]*>/i.test(md)) {
    return md;
  }
  return md
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/^(?!<[h|u|l|b])/gm, "<p>")
    .replace(/(?<![>])$/gm, "</p>")
    .replace(/<p><\/p>/g, "");
};

const BlogDetail = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [related, setRelated] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useSEO({
    title: post ? `${post.title} — SunTriX Blog` : "Blog — SunTriX AI Solutions",
    description: post?.excerpt || "Read the latest insights from SunTriX AI Solutions.",
    ogImage: post?.coverImage,
    canonicalUrl: post ? `https://www.suntrix.ai/blog/${post.slug}` : undefined,
  });

  useEffect(() => {
    const fetch_ = async () => {
      setLoading(true);
      const { data } = await apiRequest<BlogPost>(ENDPOINTS.BLOG_BY_SLUG(slug!));
      if (data && data._id) {
        setPost(data);
        // Fetch related posts
        const { data: allData } = await apiRequest<{ posts: BlogPost[] }>(ENDPOINTS.BLOG_LIST);
        if (allData?.posts) {
          const others = allData.posts.filter(
            (p) => p.slug !== slug && p.status === "published" && p.category === data.category
          ).slice(0, 3);
          setRelated(others);
        }
      } else {
        navigate("/blog", { replace: true });
      }
      setLoading(false);
    };
    if (slug) fetch_();
  }, [slug]);

  const copyUrl = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center pt-24">
          <div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!post) return null;

  const visualMedia = post.mediaAttachments?.filter(m => m.type.startsWith("image") || m.type.startsWith("video")) || [];
  const documentMedia = post.mediaAttachments?.filter(m => !m.type.startsWith("image") && !m.type.startsWith("video")) || [];

  return (
    <Layout>
      <div className="min-h-screen bg-background pt-28 pb-24">
        {/* Cover Image */}
        {post.coverImage && (
          <div className="w-full h-72 md:h-96 overflow-hidden relative">
            <img src={post.coverImage} alt={post.title} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
          </div>
        )}

        <div className="mx-auto max-w-3xl px-6">
          {/* Back */}
          <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="mb-8">
            <Link to="/blog" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors">
              <ArrowLeft className="h-4 w-4" /> Back to Blog
            </Link>
          </motion.div>

          {/* Meta */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
            <div className="flex flex-wrap items-center gap-3 mb-5">
              {post.category && (
                <Link to={`/blog`} className="text-xs font-semibold text-primary bg-primary/10 px-3 py-1.5 rounded-full hover:bg-primary/20 transition-colors">
                  {post.category}
                </Link>
              )}
              <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> {post.readTime || 5} min read
              </span>
              {post.publishedAt && (
                <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  {new Date(post.publishedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                </span>
              )}
              {post.author && (
                <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" /> {post.author}
                </span>
              )}
            </div>

            <h1 className="text-3xl md:text-4xl lg:text-5xl font-display font-bold text-foreground mb-6 leading-tight">
              {post.title}
            </h1>

            {post.excerpt && (
              <p className="text-lg text-muted-foreground leading-relaxed border-l-4 border-primary pl-5 mb-6">
                {post.excerpt}
              </p>
            )}

            {/* Visual Media Showcase (Cover Presentation) */}
            {visualMedia.length > 0 && (
              <div className="mb-10 mt-6">
                <div className={`grid gap-3 ${visualMedia.length >= 3 ? 'grid-cols-1 md:grid-cols-3 md:grid-rows-2 h-[400px] md:h-[500px]' : visualMedia.length === 2 ? 'grid-cols-1 md:grid-cols-2 h-[300px] md:h-[400px]' : 'grid-cols-1 h-[300px] md:h-[450px]'}`}>
                  {visualMedia.slice(0, 3).map((media, i) => {
                    const isMain = visualMedia.length >= 3 && i === 0;
                    const classes = `relative rounded-2xl overflow-hidden bg-black group shadow-xl border border-border/50 w-full h-full ${isMain ? 'md:col-span-2 md:row-span-2' : ''}`;
                    
                    return (
                      <div key={i} className={classes}>
                        {media.type.startsWith("video") ? (
                          <video src={media.url} controls={isMain || visualMedia.length < 3} autoPlay={!isMain && visualMedia.length >= 3} muted loop className="w-full h-full object-cover" />
                        ) : (
                          <img src={media.url} alt={media.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 cursor-pointer" onClick={() => window.open(media.url, "_blank")} />
                        )}
                        {visualMedia.length > 3 && i === 2 && (
                          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center cursor-pointer hover:bg-black/40 transition-colors" onClick={() => window.open(visualMedia[3].url, "_blank")}>
                            <span className="text-white text-3xl font-display font-bold">+{visualMedia.length - 2}</span>
                            <span className="text-white/80 font-medium">More Media</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Share */}
            <div className="flex items-center gap-3 pb-8 border-b border-border">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Share2 className="h-3.5 w-3.5" /> Share
              </span>
              <button onClick={copyUrl} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary bg-muted hover:bg-primary/10 border border-border hover:border-primary/30 px-3 py-1.5 rounded-lg transition-all">
                {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied!" : "Copy Link"}
              </button>
              <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(post.title)}&url=${encodeURIComponent(window.location.href)}`} target="_blank" rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-primary bg-muted hover:bg-primary/10 border border-border hover:border-primary/30 px-3 py-1.5 rounded-lg transition-all">
                𝕏 Tweet
              </a>
            </div>
          </motion.div>

          {/* Content */}
          <motion.article
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="prose prose-invert prose-primary max-w-none mb-12
              prose-headings:font-display prose-headings:text-foreground
              prose-p:text-muted-foreground prose-p:leading-relaxed
              prose-a:text-primary prose-a:no-underline hover:prose-a:underline
              prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-primary prose-code:text-sm
              prose-blockquote:border-primary prose-blockquote:text-muted-foreground
              prose-strong:text-foreground
              prose-li:text-muted-foreground"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(renderMarkdown(post.content)) }}
          />

          {/* Document Assets (Downloads) */}
          {documentMedia.length > 0 && (
            <div className="mb-16 mt-12 pt-10 border-t border-border">
              <h3 className="text-2xl font-display font-bold text-foreground mb-6 flex items-center gap-3">
                <FileText className="w-6 h-6 text-primary" />
                Attached Assets
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {documentMedia.map((media, i) => (
                  <a key={i} href={safeHref(media.url)} target="_blank" rel="noopener noreferrer" 
                     className="flex items-center gap-4 p-5 rounded-2xl border border-border bg-card hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 group">
                    <div className="p-3.5 bg-primary/10 text-primary rounded-xl group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
                      <Download className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">{media.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{formatBytes(media.size)} • {media.type.split('/')[1]?.toUpperCase() || "FILE"}</p>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Tags */}
          {post.tags?.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-12 pb-8 border-b border-border">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mr-2">
                <Tag className="h-3.5 w-3.5" /> Tags
              </span>
              {post.tags.map((tag) => (
                <span key={tag} className="text-xs text-muted-foreground bg-muted hover:bg-muted/70 border border-border px-3 py-1 rounded-full transition-colors cursor-pointer">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Related Posts */}
          {related.length > 0 && (
            <div>
              <h2 className="text-xl font-display font-bold text-foreground mb-6">Related Articles</h2>
              <div className="grid gap-4">
                {related.map((r) => (
                  <Link key={r._id} to={`/blog/${r.slug}`} className="group flex gap-4 bg-card border border-border rounded-xl p-4 hover:border-primary/50 transition-all">
                    {r.coverImage && (
                      <img src={r.coverImage} alt={r.title} className="h-16 w-24 object-cover rounded-lg shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground group-hover:text-primary transition-colors line-clamp-2">{r.title}</p>
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {r.readTime || 5} min read
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all shrink-0 self-center" />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Back CTA */}
          <div className="mt-12 text-center">
            <Link to="/blog" className="inline-flex items-center gap-2 bg-card border border-border text-foreground px-6 py-3 rounded-xl hover:border-primary/50 hover:text-primary transition-all text-sm font-medium">
              <ArrowLeft className="h-4 w-4" /> View All Articles
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default BlogDetail;
