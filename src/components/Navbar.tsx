import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { apiRequest, ENDPOINTS } from "@/lib/api";
import { useCompanyInfo } from "@/hooks/useCompanyInfo";
import { Menu, X, ChevronDown, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ThemeToggle from "@/components/ThemeToggle";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useI18n } from "@/lib/i18n";
import { useMedia } from "@/hooks/use-media";


const Navbar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  const [services, setServices] = useState<{name: string, desc: string, href: string}[]>([]);
  const companyName = useCompanyInfo().name || "SunTriX";
  const { t } = useI18n();
  const suntrixLogo = useMedia("suntrix-logo");

  useEffect(() => {
    apiRequest<any[]>(ENDPOINTS.DEPARTMENTS_LIST).then(({ data }) => {
      if (Array.isArray(data)) {
        setServices(data.map(d => ({
          name: d.name,
          desc: d.subtitle,
          href: d.href
        })));
      }
    });
  }, []);

  const renderLogoText = () => {
    if (companyName.toLowerCase().includes("suntrix")) {
      return <>Sun<span className="text-primary">Tri</span>X</>;
    }
    return companyName;
  };

  return (
    <nav className="sticky top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/70 backdrop-blur-xl">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 lg:px-8">
        <Link to="/" className="flex items-center gap-2.5">
          <img src={suntrixLogo} alt="SunTriX" className="h-9 w-9 rounded-lg object-contain" />
          <span className="text-xl font-display font-bold text-foreground">
            {renderLogoText()}
          </span>
        </Link>

        <div className="hidden lg:flex items-center gap-8">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">{t("nav.home")}</Link>
          
          <div className="relative" onMouseEnter={() => setServicesOpen(true)} onMouseLeave={() => setServicesOpen(false)}>
            <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
              {t("nav.services")} <ChevronDown className={`h-3 w-3 transition-transform ${servicesOpen ? "rotate-180" : ""}`} />
            </button>
            <AnimatePresence>
              {servicesOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-[400px] rounded-xl border border-border bg-card/95 backdrop-blur-xl p-3 shadow-2xl"
                >
                  {services.map((s) => (
                    <Link key={s.name} to={s.href} className="flex flex-col rounded-lg p-3 hover:bg-primary/5 transition-colors group">
                      <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{s.name}</span>
                      <span className="text-xs text-muted-foreground">{s.desc}</span>
                    </Link>
                  ))}
                  <div className="border-t border-border mt-2 pt-2">
                    <Link to="/services" className="flex items-center gap-2 rounded-lg p-3 text-sm text-primary hover:bg-primary/5 transition-colors font-semibold">
                      {t("nav.services")} — All <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <Link to="/work" className="text-sm text-muted-foreground hover:text-foreground transition-colors">{t("nav.portfolio")}</Link>
          <Link to="/pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Pricing</Link>
          <Link to="/blog" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Blog</Link>
          <Link to="/about" className="text-sm text-muted-foreground hover:text-foreground transition-colors">{t("nav.about")}</Link>
          <Link to="/how-we-work" className="text-sm text-muted-foreground hover:text-foreground transition-colors">{t("nav.howWeWork")}</Link>
          <Link to="/contact" className="text-sm text-muted-foreground hover:text-foreground transition-colors">{t("nav.contact")}</Link>
        </div>

        <div className="hidden lg:flex items-center gap-3">
          <LanguageSwitcher />
          <ThemeToggle />
          <Link to="/request-task" className="gradient-bg rounded-lg px-5 py-2 text-sm font-bold text-primary-foreground hover:opacity-90 transition-opacity">
            {t("nav.requestTask")}
          </Link>
        </div>

        <button onClick={() => setMobileOpen(!mobileOpen)} className="lg:hidden p-2 text-foreground">
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="lg:hidden border-t border-border bg-card/95 backdrop-blur-xl overflow-hidden"
          >
            <div className="container mx-auto px-4 py-4 space-y-1">
              {[
                { to: "/", label: t("nav.home") },
                { to: "/services", label: t("nav.services") },
                { to: "/work", label: t("nav.portfolio") },
                { to: "/pricing", label: "Pricing" },
                { to: "/blog", label: "Blog" },
                { to: "/about", label: t("nav.about") },
                { to: "/how-we-work", label: t("nav.howWeWork") },
                { to: "/contact", label: t("nav.contact") },
              ].map((link) => (
                <Link key={link.to} to={link.to} onClick={() => setMobileOpen(false)}
                  className="block rounded-lg px-4 py-3 text-sm text-foreground hover:bg-primary/5 transition-colors">{link.label}</Link>
              ))}
              <div className="flex items-center gap-3 px-4 pt-3 border-t border-border">
                <LanguageSwitcher />
                <ThemeToggle />
              </div>
              <Link to="/request-task" onClick={() => setMobileOpen(false)}
                className="block gradient-bg rounded-lg px-4 py-3 text-sm font-bold text-primary-foreground text-center mt-2">{t("nav.requestTask")}</Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

export default Navbar;
