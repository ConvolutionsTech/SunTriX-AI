import Layout from "@/components/Layout";

const LegalPage = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <Layout>
    <section className="pt-32 pb-20">
      <div className="container mx-auto px-4 lg:px-8 pt-16 max-w-3xl">
        <h1 className="text-3xl font-extrabold mb-8">{title}</h1>
        <div className="prose prose-invert prose-sm max-w-none space-y-6 text-muted-foreground">
          {children}
        </div>
      </div>
    </section>
  </Layout>
);

export const PrivacyPolicy = () => (
  <LegalPage title="Privacy Policy">
    <p>Last updated: October 2026</p>
    <h2 className="text-xl font-bold text-foreground mt-8">1. Information We Collect</h2>
    <p>We collect information you provide directly, including name, email, company, and project details when you submit forms or contact us.</p>
    <h2 className="text-xl font-bold text-foreground mt-8">2. How We Use Your Information</h2>
    <p>We use your information to respond to inquiries, provide services, send project proposals, and improve our website experience.</p>
    <h2 className="text-xl font-bold text-foreground mt-8">3. Data Protection</h2>
    <p>We implement industry-standard security measures to protect your data, and all connections to our site and API are encrypted (HTTPS).</p>
    <h2 className="text-xl font-bold text-foreground mt-8">4. Service Providers</h2>
    <p>We use a small number of providers to run the service: MongoDB Atlas (database hosting), Stripe (payments — we never see or store card details), Resend (email delivery), Groq (AI chat assistant and proposal drafting — messages you send to the chat assistant are processed by Groq), and Cloudinary (file and image hosting).</p>
    <h2 className="text-xl font-bold text-foreground mt-8">5. Your Choices</h2>
    <p>Every newsletter email has an unsubscribe link. To access, correct or delete the personal data we hold about you, email us at the address below.</p>
    <h2 className="text-xl font-bold text-foreground mt-8">6. Contact</h2>
    <p>For privacy inquiries, contact us at privacy@suntrix.com.</p>
  </LegalPage>
);

export const TermsOfService = () => (
  <LegalPage title="Terms of Service">
    <p>Last updated: February 2026</p>
    <h2 className="text-xl font-bold text-foreground mt-8">1. Acceptance of Terms</h2>
    <p>By accessing this website, you agree to be bound by these terms and conditions.</p>
    <h2 className="text-xl font-bold text-foreground mt-8">2. Services</h2>
    <p>SunTriX provides AI engineering, machine learning, computer vision, and SaaS development services as described on this website.</p>
    <h2 className="text-xl font-bold text-foreground mt-8">3. Intellectual Property</h2>
    <p>All content on this website is the property of SunTriX unless otherwise stated.</p>
    <h2 className="text-xl font-bold text-foreground mt-8">4. Limitation of Liability</h2>
    <p>SunTriX shall not be liable for any indirect or consequential damages arising from the use of our services.</p>
  </LegalPage>
);

export const CookiePolicy = () => (
  <LegalPage title="Cookie Policy">
    <p>Last updated: October 2026</p>
    <h2 className="text-xl font-bold text-foreground mt-8">1. What Are Cookies</h2>
    <p>Cookies are small text files stored on your device when you visit our website.</p>
    <h2 className="text-xl font-bold text-foreground mt-8">2. How We Use Cookies</h2>
    <p>This website does not set advertising or analytics cookies. The admin area keeps its sign-in session in your browser&apos;s local storage. Embedded YouTube or Vimeo videos may set their own cookies when you play them, and paying an invoice takes you to Stripe Checkout, which uses Stripe&apos;s cookies under Stripe&apos;s policy.</p>
    <h2 className="text-xl font-bold text-foreground mt-8">3. Managing Cookies</h2>
    <p>You can control cookies through your browser settings. Disabling cookies may affect website functionality.</p>
  </LegalPage>
);
