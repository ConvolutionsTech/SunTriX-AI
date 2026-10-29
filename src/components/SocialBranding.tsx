import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ExternalLink } from "lucide-react";
import { apiRequest, ENDPOINTS } from "@/lib/api";
import { SocialIconSVG, PLATFORM_BRAND } from "@/components/SocialIcons";
import { safeHref } from "@/lib/sanitize";

interface SocialLink {
  platform: string;
  url: string;
  enabled: boolean;
}

interface SocialLinksResponse {
  links: SocialLink[];
}

const SocialBranding = () => {
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);

  useEffect(() => {
    apiRequest<SocialLinksResponse>(ENDPOINTS.CMS_SOCIAL_LINKS).then(({ data }) => {
      if (data && data.links) setSocialLinks(data.links);
    });
  }, []);

  const activeLinks = socialLinks.filter((l) => l.enabled && l.url && l.url !== "#");

  if (activeLinks.length === 0) return null;

  return (
    <section className="py-16 border-t border-border">
      <div className="container mx-auto px-4 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-8"
        >
          <span className="text-xs font-mono text-primary uppercase tracking-widest">Find Us On</span>
        </motion.div>
        <div className="flex flex-wrap justify-center gap-4">
          {activeLinks.map((link, i) => {
            const brand = PLATFORM_BRAND[link.platform];
            const icon = SocialIconSVG[link.platform];
            return (
              <motion.a
                key={link.platform}
                href={safeHref(link.url)}
                target="_blank"
                rel="noopener noreferrer"
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                whileHover={{ scale: 1.04, y: -2 }}
                className={`inline-flex items-center gap-3 rounded-xl border border-border bg-card px-6 py-4 text-sm font-medium text-foreground transition-all duration-300 ${brand?.bg || "hover:bg-primary/5"} ${brand?.border || "hover:border-primary/30"}`}
              >
                {icon ? (
                  <span style={{ color: brand?.color }} className="transition-colors">
                    {icon}
                  </span>
                ) : (
                  <span className="text-lg">🔗</span>
                )}
                {link.platform}
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              </motion.a>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default SocialBranding;
