import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { Mail } from "lucide-react";
import { apiRequest, ENDPOINTS } from "@/lib/api";
import { useCompanyInfo } from "@/hooks/useCompanyInfo";
import { toast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { useMedia } from "@/hooks/use-media";
import { SocialIconSVG, PLATFORM_BRAND } from "@/components/SocialIcons";
import { safeHref } from "@/lib/sanitize";

const Footer = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [interest, setInterest] = useState("General News");
  const { t } = useI18n();
  const suntrixLogo = useMedia("suntrix-logo");
  const [socialLinks, setSocialLinks] = useState<{platform: string, url: string, enabled: boolean}[]>([]);
  const companyInfo = useCompanyInfo();

  useEffect(() => {
    // Fetch social links
    apiRequest<{links: {platform: string, url: string, enabled: boolean}[]}>(ENDPOINTS.CMS_SOCIAL_LINKS).then(({ data }) => {
      if (data && data.links) setSocialLinks(data.links);
    });
  }, []);

  const activeLinks = socialLinks.filter((l) => l.enabled && l.url && l.url !== "#");
  const companyName = companyInfo.name || "SunTriX AI Solutions";
  const footerTagline = companyInfo.tagline || t("footer.tagline") || "Your AI-first technology partner delivering end-to-end AI engineering.";

  const renderLogoText = () => {
    if (companyName.toLowerCase().includes("suntrix")) {
      return <>Sun<span className="text-primary">Tri</span>X</>;
    }
    return companyName;
  };


  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !interest) return;
    
    try {
      const res = await apiRequest(ENDPOINTS.NEWSLETTER_SUBSCRIBE, {
        method: "POST",
        body: { name, email, interest }
      });
      
      if (res.error) {
        toast({ title: "Couldn't subscribe", description: res.error, variant: "destructive" });
      } else {
        const needsConfirmation = (res.data as { requiresConfirmation?: boolean } | null)?.requiresConfirmation;
        toast(
          needsConfirmation
            ? { title: "Check your inbox", description: "Click the link we just sent to confirm your subscription." }
            : { title: "Subscribed!", description: "You've successfully joined our newsletter." }
        );
        setEmail("");
        setName("");
        setInterest("General News");
      }
    } catch {
      toast({ title: "Error", description: "Failed to connect to the server.", variant: "destructive" });
    }
  };

  return (
    <footer className="border-t border-border bg-card/30 pt-20 pb-10 relative overflow-hidden">
      <div className="absolute inset-0 bg-neural-grid opacity-5 pointer-events-none" />
      
      <div className="container mx-auto px-4 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-16">
          {/* Logo & Description */}
          <div className="lg:col-span-4 space-y-6">
            <Link to="/" className="flex items-center gap-2 group">
              <div className="h-10 w-10 rounded-xl gradient-bg p-2 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
                <img src={suntrixLogo} alt="SunTriX" className="h-full w-full object-contain brightness-0 invert" />
              </div>
              <span className="text-xl font-display font-black text-foreground tracking-tight">
                {renderLogoText()}
              </span>
            </Link>
            {/* Dynamic company tagline from CMS */}
            <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">
              {footerTagline}
            </p>
            <div className="flex items-center gap-3 pt-2">
              {activeLinks.slice(0, 5).map((link) => {
                const brand = PLATFORM_BRAND[link.platform];
                const icon = SocialIconSVG[link.platform];
                return (
                  <a key={link.platform} href={safeHref(link.url)} target="_blank" rel="noopener noreferrer"
                    title={link.platform}
                    className={`h-9 w-9 rounded-lg border border-border bg-muted/30 flex items-center justify-center transition-all ${brand?.bg || "hover:bg-primary/10"} ${brand?.border || "hover:border-primary/30"}`}
                    style={{ color: brand?.color }}
                  >
                    {icon ?? <span className="text-lg">🔗</span>}
                  </a>
                );
              })}
            </div>
          </div>

          {/* Quick Links */}
          <div className="lg:col-span-2 space-y-6">
            <h4 className="text-xs font-bold uppercase tracking-widest text-foreground/50">{t("nav.services")}</h4>
            <ul className="space-y-3">
              <li><Link to="/services/agentic-ai" className="text-sm text-muted-foreground hover:text-primary transition-colors inline-block">Agentic AI</Link></li>
              <li><Link to="/services/ai-ml" className="text-sm text-muted-foreground hover:text-primary transition-colors inline-block">AI & ML</Link></li>
              <li><Link to="/services/computer-vision" className="text-sm text-muted-foreground hover:text-primary transition-colors inline-block">Computer Vision</Link></li>
              <li><Link to="/services/saas-platform" className="text-sm text-muted-foreground hover:text-primary transition-colors inline-block">SaaS Platform</Link></li>
            </ul>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <h4 className="text-xs font-bold uppercase tracking-widest text-foreground/50">Company</h4>
            <ul className="space-y-3">
              <li><Link to="/about" className="text-sm text-muted-foreground hover:text-primary transition-colors inline-block">{t("nav.about")}</Link></li>
              <li><Link to="/work" className="text-sm text-muted-foreground hover:text-primary transition-colors inline-block">{t("nav.portfolio")}</Link></li>
              <li><Link to="/pricing" className="text-sm text-muted-foreground hover:text-primary transition-colors inline-block">Pricing</Link></li>
              <li><Link to="/blog" className="text-sm text-muted-foreground hover:text-primary transition-colors inline-block">Blog</Link></li>
              <li><Link to="/how-we-work" className="text-sm text-muted-foreground hover:text-primary transition-colors inline-block">{t("nav.howWeWork")}</Link></li>
              <li><Link to="/contact" className="text-sm text-muted-foreground hover:text-primary transition-colors inline-block">{t("nav.contact")}</Link></li>
            </ul>
          </div>

          {/* Newsletter Form */}
          <div className="lg:col-span-4 space-y-6">
            <div className="p-6 rounded-2xl bg-muted/20 border border-border backdrop-blur-sm relative group overflow-hidden">
              <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-colors" />
              <h4 className="text-sm font-bold text-foreground mb-2 flex items-center gap-2">
                <Mail className="h-4 w-4 text-primary" /> Join our Newsletter
              </h4>
              <p className="text-xs text-muted-foreground mb-4">Get the latest AI insights and updates from the {companyName} team.</p>
              
              <form onSubmit={handleSubscribe} className="space-y-3">
                <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Full Name" required
                  className="w-full rounded-xl border border-border bg-background/50 px-4 py-2.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary transition-all shadow-sm" />
                
                <select value={interest} onChange={(e) => setInterest(e.target.value)} required
                  className="w-full rounded-xl border border-border bg-background/50 px-4 py-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary appearance-none cursor-pointer transition-all shadow-sm">
                  <option value="General News">General News</option>
                  <option value="Call to Action">Call to Action</option>
                  <option value="Platform Updates">Platform Updates</option>
                  <option value="All">All Topics</option>
                </select>

                <div className="flex gap-2">
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email Address" required
                    className="flex-1 rounded-xl border border-border bg-background/50 px-4 py-2.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary transition-all shadow-sm" />
                  <button type="submit" className="gradient-bg rounded-xl px-5 py-2.5 text-xs font-bold text-primary-foreground hover:opacity-90 transition-all shadow-lg shadow-primary/20 active:scale-95 whitespace-nowrap">
                    Join
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-col md:flex-row items-center gap-4 md:gap-8">
            {/* Dynamic company name in copyright */}
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
              © {new Date().getFullYear()} {companyName}
            </p>
            <div className="flex items-center gap-6">
              <Link to="/legal/privacy" className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors font-bold">Privacy</Link>
              <Link to="/legal/terms" className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors font-bold">Terms</Link>
              <Link to="/legal/cookies" className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors font-bold">Cookies</Link>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">AI Engineering Excellence</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
