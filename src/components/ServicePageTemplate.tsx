import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle, Play } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Layout from "@/components/Layout";
import { apiRequest, ENDPOINTS } from "@/lib/api";
import { useState, useEffect } from "react";

interface PortfolioProject { _id: string; title: string; slug: string; category: string; shortDescription: string; metric: string; metricLabel: string; thumbnailImage: string; coverImage: string; videoUrl: string; tools: { name: string; icon: string }[]; status: string; }

interface ServicePageProps {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  description: string;
  category: string;
  image?: string;
  useCases?: { title: string; desc: string }[];
  process?: { step: string; title: string; desc: string }[];
  techStack?: string[];
  caseStudy?: { title: string; metric: string; desc: string };
}

interface Department { _id: string; name: string; image: string; enabled: boolean; }

const ServicePageTemplate = ({ icon: Icon, title, subtitle, description, category, image, useCases, process, techStack, caseStudy }: ServicePageProps) => {
  const [relatedProjects, setRelatedProjects] = useState<PortfolioProject[]>([]);
  const [deptInfo, setDeptInfo] = useState<Department | null>(null);

  useEffect(() => {
    apiRequest<PortfolioProject[]>(ENDPOINTS.PORTFOLIO_LIST).then(({ data }) => {
      if (data) {
        setRelatedProjects(data.filter((p) => p.status === "published" && p.category === category).slice(0, 3));
      }
    });

    apiRequest<Department[]>(ENDPOINTS.DEPARTMENTS_LIST).then(({ data }) => {
      if (data) {
        const found = data.find(d => d.name === category || d.name.includes(category));
        if (found) setDeptInfo(found);
      }
    });
  }, [category]);

  return (
    <Layout>
      {/* Hero */}
      <section className="relative pt-32 pb-20 bg-grid-pattern overflow-hidden">
        <div className="absolute top-1/4 -right-32 h-96 w-96 rounded-full bg-primary/10 blur-[100px] opacity-50" />
        <div className="absolute bottom-0 left-0 h-64 w-64 rounded-full bg-secondary/5 blur-[80px]" />
        
        <div className="container mx-auto px-4 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }} className="max-w-xl">
              <div className="inline-flex rounded-xl gradient-bg p-3 mb-6 shadow-lg shadow-primary/20">
                <Icon className="h-8 w-8 text-primary-foreground" />
              </div>
              <span className="block text-xs font-mono text-primary uppercase tracking-widest mb-4">{category} Solutions</span>
              <h1 className="text-4xl lg:text-6xl font-display font-black text-foreground mb-6 leading-tight whitespace-pre-line">{title}</h1>
              <p className="text-xl text-muted-foreground/80 mb-6 font-medium leading-relaxed">{subtitle}</p>
              <p className="text-base text-muted-foreground leading-relaxed mb-10 border-l-2 border-primary/20 pl-6 italic">{description}</p>
              <Link to="/request-task" className="gradient-bg inline-flex items-center gap-2 rounded-xl px-8 py-4 text-sm font-bold text-primary-foreground hover:opacity-90 transition-all shadow-xl shadow-primary/20 active:scale-95">
                Request a Custom Task <ArrowRight className="h-4 w-4" />
              </Link>
            </motion.div>

            {(image || deptInfo?.image) && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, x: 30 }} 
                animate={{ opacity: 1, scale: 1, x: 0 }} 
                transition={{ duration: 0.8, delay: 0.2 }}
                className="relative group lg:block hidden"
              >
                <div className="absolute -inset-4 bg-gradient-to-tr from-primary/30 to-secondary/30 rounded-[2.5rem] blur-3xl opacity-20 group-hover:opacity-40 transition-opacity duration-700" />
                <div className="relative rounded-3xl border border-white/10 overflow-hidden bg-card/50 backdrop-blur-sm shadow-[0_20px_50px_rgba(0,0,0,0.5)] rotate-2 group-hover:rotate-0 transition-all duration-700">
                  <div className="absolute inset-0 bg-gradient-to-t from-background/40 to-transparent z-10" />
                  <img src={image || deptInfo?.image} alt={title} className="w-full h-auto object-cover aspect-[4/3]" />
                </div>
                {/* Micro-interaction element */}
                <div className="absolute -bottom-6 -left-6 bg-card border border-border p-4 rounded-xl shadow-2xl z-20 animate-bounce-subtle">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg gradient-bg flex items-center justify-center">
                      <Icon className="h-5 w-5 text-primary-foreground" />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Certified</p>
                      <p className="text-xs font-bold text-foreground">AI Engineering</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </section>

      {/* Use Cases */}
      {useCases && useCases.length > 0 && (
        <section className="py-24 border-t border-border">
          <div className="container mx-auto px-4 lg:px-8">
            <h2 className="text-3xl font-extrabold mb-12">Use <span className="gradient-text">Cases</span></h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {useCases.map((uc, i) => (
                <motion.div key={uc.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}
                  className="rounded-xl border border-border bg-card p-6 hover:border-primary/30 glow-hover transition-all">
                  <h3 className="text-lg font-bold mb-2 text-foreground">{uc.title}</h3>
                  <p className="text-sm text-muted-foreground">{uc.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Process */}
      {process && process.length > 0 && (
        <section className="py-24 bg-card/30 border-t border-border">
          <div className="container mx-auto px-4 lg:px-8">
            <h2 className="text-3xl font-extrabold mb-12">How We <span className="gradient-text">Build It</span></h2>
            <div className="grid md:grid-cols-4 gap-6">
              {process.map((p, i) => (
                <motion.div key={p.step} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                  className="text-center">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-sm font-mono font-bold text-primary mb-4">{p.step}</span>
                  <h3 className="text-lg font-bold mb-2 text-foreground">{p.title}</h3>
                  <p className="text-sm text-muted-foreground">{p.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Tech Stack */}
      {techStack && techStack.length > 0 && (
        <section className="py-24 border-t border-border">
          <div className="container mx-auto px-4 lg:px-8">
            <h2 className="text-3xl font-extrabold mb-12">Tech <span className="gradient-text">Stack</span></h2>
            <div className="flex flex-wrap gap-3">
              {techStack.map((tech) => (
                <span key={tech} className="rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-mono text-muted-foreground hover:text-primary hover:border-primary/30 transition-colors">{tech}</span>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Related Portfolio */}
      {relatedProjects.length > 0 && (
        <section className="py-24 bg-card/30 border-t border-border">
          <div className="container mx-auto px-4 lg:px-8">
            <h2 className="text-3xl font-extrabold mb-12">Our <span className="gradient-text">{category}</span> Work</h2>
            <div className="grid md:grid-cols-3 gap-6">
              {relatedProjects.map((project, i) => (
                <motion.div
                  key={project._id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                >
                  <Link
                    to={`/work/${project.slug}`}
                    className="group block rounded-xl border border-border bg-card overflow-hidden hover:border-primary/30 glow-hover transition-all"
                  >
                    <div className="h-40 bg-gradient-to-br from-primary/10 via-secondary/5 to-transparent flex items-center justify-center relative">
                      {(project.thumbnailImage || project.coverImage) ? (
                        <img src={project.thumbnailImage || project.coverImage} alt={project.title} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-3xl font-extrabold gradient-text">{project.metric}</span>
                      )}
                      {project.videoUrl && (
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="h-10 w-10 rounded-full bg-primary/90 flex items-center justify-center">
                            <Play className="h-4 w-4 text-primary-foreground ml-0.5" />
                          </div>
                        </div>
                      )}
                      <div className="absolute bottom-2 left-3">
                        <span className="text-lg font-extrabold gradient-text">{project.metric}</span>
                        <p className="text-[10px] text-muted-foreground">{project.metricLabel}</p>
                      </div>
                    </div>
                    <div className="p-5">
                      <h3 className="text-sm font-bold text-foreground mb-1 group-hover:text-primary transition-colors">{project.title}</h3>
                      <p className="text-xs text-muted-foreground line-clamp-2">{project.shortDescription}</p>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary mt-3 group-hover:gap-2 transition-all">
                        View Project <ArrowRight className="h-3 w-3" />
                      </span>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Case Study Teaser */}
      {caseStudy && caseStudy.title && (
        <section className="py-24 border-t border-border">
          <div className="container mx-auto px-4 lg:px-8">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              className="rounded-xl border border-border bg-card p-8 lg:p-12 max-w-3xl">
              <span className="text-xs font-mono text-primary uppercase tracking-widest mb-2 block">Case Study</span>
              <h3 className="text-2xl font-bold mb-2 text-foreground">{caseStudy.title}</h3>
              <div className="inline-flex items-center gap-2 rounded-full bg-success/10 px-4 py-1.5 mb-4">
                <CheckCircle className="h-4 w-4 text-success" />
                <span className="text-sm font-semibold text-success">{caseStudy.metric}</span>
              </div>
              <p className="text-muted-foreground mb-6">{caseStudy.desc}</p>
              <Link to="/work" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                View Full Case Study <ArrowRight className="h-3 w-3" />
              </Link>
            </motion.div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="py-24 border-t border-border">
        <div className="container mx-auto px-4 lg:px-8 text-center">
          <h2 className="text-3xl lg:text-4xl font-extrabold mb-4">Ready to <span className="gradient-text">Start</span>?</h2>
          <p className="text-muted-foreground mb-8">24-hour proposal guarantee. No commitment required.</p>
          <Link to="/request-task" className="gradient-bg inline-flex items-center gap-2 rounded-lg px-8 py-4 text-base font-semibold text-primary-foreground hover:opacity-90 transition-opacity">
            Request a Custom Task <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </Layout>
  );
};

export default ServicePageTemplate;
