import { motion } from "framer-motion";
import { Mail, Phone, MapPin, Clock, Send } from "lucide-react";
import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { toast } from "@/hooks/use-toast";
import { apiRequest, ENDPOINTS } from "@/lib/api";
import { useCompanyInfo } from "@/hooks/useCompanyInfo";
import { useSEO } from "@/hooks/useSEO";
import { safeHref } from "@/lib/sanitize";


const Contact = () => {
  useSEO({
    title: "Contact Us — SunTriX AI Solutions",
    description: "Get in touch with SunTriX AI Solutions to discuss your next enterprise AI or machine learning project.",
    canonicalUrl: "https://www.suntrix.ai/contact",
  });

  const [form, setForm] = useState({ name: "", email: "", company: "", subject: "", message: "" });
  const [loading, setLoading] = useState(false);
  // Company info from CMS — email, phone, address, response time
  const company = useCompanyInfo();


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await apiRequest(ENDPOINTS.CONTACT_SUBMIT, {
      method: "POST",
      body: { name: form.name, email: form.email, company: form.company, subject: form.subject || "Website Contact", message: form.message },
    });
    setLoading(false);
    if (!error) {
      toast({ title: "Message sent!", description: "We'll get back to you within 24 hours." });
      setForm({ name: "", email: "", company: "", subject: "", message: "" });
    } else {
      toast({ title: "Error", description: error, variant: "destructive" });
    }
  };

  return (
    <Layout>
      <section className="pt-32 pb-20 bg-grid-pattern">
        <div className="container mx-auto px-4 lg:px-8 pt-16">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center max-w-3xl mx-auto mb-16">
            <span className="inline-block text-xs font-mono text-primary uppercase tracking-widest mb-4">Contact</span>
            <h1 className="text-4xl lg:text-6xl font-extrabold mb-6">
              Let's <span className="gradient-text">Talk</span>
            </h1>
            <p className="text-lg text-muted-foreground">
              Ready to start your AI project? Reach out and we'll respond within 24 hours.
            </p>
          </motion.div>

          <div className="grid lg:grid-cols-5 gap-12 max-w-6xl mx-auto">
            {/* Form */}
            <motion.div className="lg:col-span-3" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
              <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-card p-8 space-y-6">
                <div className="grid sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Full Name *</label>
                    <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full rounded-lg border border-border bg-surface2 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="John Doe" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Email *</label>
                    <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className="w-full rounded-lg border border-border bg-surface2 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="john@company.com" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Company</label>
                  <input type="text" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })}
                    className="w-full rounded-lg border border-border bg-surface2 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Acme Inc." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Message *</label>
                  <textarea required rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })}
                    className="w-full rounded-lg border border-border bg-surface2 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                    placeholder="Tell us about your project..." />
                </div>
                <button type="submit" disabled={loading} className="gradient-bg inline-flex items-center gap-2 rounded-lg px-6 py-3.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity w-full justify-center disabled:opacity-60">
                  {loading ? "Sending…" : <><span>Send Message</span> <Send className="h-4 w-4" /></>}
                </button>
              </form>
            </motion.div>

            {/* Contact Info — dynamic from CMS */}
            <motion.div className="lg:col-span-2 space-y-6" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
              {[
                {
                  icon: Mail,
                  title: "Email",
                  value: company.email || "hello@suntrix.com",
                  link: `mailto:${company.email || "hello@suntrix.com"}`,
                },
                {
                  icon: Phone,
                  title: "Phone",
                  value: company.phone || "+1 (555) 123-4567",
                  link: company.phone ? `tel:${company.phone.replace(/[^+\d]/g, "")}` : "tel:+15551234567",
                },
                {
                  icon: MapPin,
                  title: "Location",
                  value: company.address || "San Francisco, CA & Remote",
                },
                {
                  icon: Clock,
                  title: "Response Time",
                  value: company.responseTime || "Within 24 hours",
                },
              ].map((item) => (
                <div key={item.title} className="rounded-xl border border-border bg-card p-6 flex items-start gap-4">
                  <div className="rounded-lg bg-muted p-2.5">
                    <item.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.title}</p>
                    {item.link ? (
                      <a href={safeHref(item.link)} className="text-sm text-primary hover:underline">{item.value}</a>
                    ) : (
                      <p className="text-sm text-muted-foreground">{item.value}</p>
                    )}
                  </div>
                </div>
              ))}

              <div className="rounded-xl border border-primary/30 bg-primary/5 p-6">
                <p className="text-sm font-semibold text-foreground mb-2">Prefer to submit a detailed brief?</p>
                <p className="text-xs text-muted-foreground mb-3">Use our Request a Task form for structured project submissions.</p>
                <a href="/request-task" className="text-sm font-medium text-primary hover:underline">Request a Custom Task →</a>
              </div>
            </motion.div>
          </div>
        </div>
      </section>
    </Layout>
  );
};

export default Contact;
