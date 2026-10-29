import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { ThemeProvider } from "next-themes";
import { I18nProvider } from "@/lib/i18n";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { RobotsGuard } from "./components/RobotsGuard";
import ServicesOverview from "./pages/ServicesOverview";

import DynamicService from "./pages/services/DynamicService";
import HowWeWork from "./pages/HowWeWork";
import Portfolio from "./pages/Portfolio";
import PortfolioDetail from "./pages/PortfolioDetail";
import About from "./pages/About";
import Contact from "./pages/Contact";
import RequestTask from "./pages/RequestTask";
import Technologies from "./pages/Technologies";
import Partnership from "./pages/Partnership";
import Testimonials from "./pages/Testimonials";
import { PrivacyPolicy, TermsOfService, CookiePolicy } from "./pages/Legal";
import Blog from "./pages/Blog";
import BlogDetail from "./pages/BlogDetail";
import Pricing from "./pages/Pricing";
import { DynamicFavicon } from "@/components/DynamicFavicon";

import { queryClient } from "@/lib/query-client";
import LoadingSkeleton from "./components/LoadingSkeleton";

// Admin, client capability-link and payment pages load on demand: public visitors never download them
const NewsletterStatus = lazy(() => import("./pages/NewsletterStatus"));
const TrackRequest = lazy(() => import("./pages/TrackRequest"));
const AdminLogin = lazy(() => import("./pages/admin/AdminLogin"));
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminTasks = lazy(() => import("./pages/admin/AdminTasks"));
const AdminMessages = lazy(() => import("./pages/admin/AdminMessages"));
const AdminNewsletter = lazy(() => import("./pages/admin/AdminNewsletter"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings"));
const AdminPortfolio = lazy(() => import("./pages/admin/AdminPortfolio"));
const AdminContent = lazy(() => import("./pages/admin/AdminContent"));
const AdminDepartments = lazy(() => import("./pages/admin/AdminDepartments"));
const AdminMedia = lazy(() => import("./pages/admin/AdminMedia"));
const AdminAuditLog = lazy(() => import("./pages/admin/AdminAuditLog"));
const AdminTeam = lazy(() => import("./pages/admin/AdminTeam"));
const AdminClients = lazy(() => import("./pages/admin/AdminClients"));
const AdminPricing = lazy(() => import("./pages/admin/AdminPricing"));
const AdminBlog = lazy(() => import("./pages/admin/AdminBlog"));
const AdminPayments = lazy(() => import("./pages/admin/AdminPayments"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminAccount = lazy(() => import("./pages/admin/AdminAccount"));
const AdminPasswordReset = lazy(() => import("./pages/admin/AdminPasswordReset"));
const PaymentSuccess = lazy(() => import("./pages/PaymentSuccess"));
const PaymentCancel = lazy(() => import("./pages/PaymentCancel"));
const ClientInvoice = lazy(() => import("./pages/ClientInvoice"));
const ClientProposal = lazy(() => import("./pages/ClientProposal"));
const ClientContract = lazy(() => import("./pages/ClientContract"));
const ClientProjectHub = lazy(() => import("./pages/ClientProjectHub"));

const ScrollToTop = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
};

const AppRoutes = () => {
  return (
    <>
      <ScrollToTop />
      <RobotsGuard />
      <Suspense fallback={<LoadingSkeleton />}>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/services" element={<ServicesOverview />} />

        <Route path="/services/:slug" element={<DynamicService />} />
        <Route path="/how-we-work" element={<HowWeWork />} />
        <Route path="/work" element={<Portfolio />} />
        <Route path="/work/:slug" element={<PortfolioDetail />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/request-task" element={<RequestTask />} />
        <Route path="/track" element={<TrackRequest />} />
        <Route path="/track/:token" element={<TrackRequest />} />
        <Route path="/technologies" element={<Technologies />} />
        <Route path="/partnership" element={<Partnership />} />
        <Route path="/testimonials" element={<Testimonials />} />
        <Route path="/legal/privacy" element={<PrivacyPolicy />} />
        <Route path="/legal/terms" element={<TermsOfService />} />
        <Route path="/legal/cookies" element={<CookiePolicy />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/blog/:slug" element={<BlogDetail />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/payment/success" element={<PaymentSuccess />} />
        <Route path="/payment/cancel" element={<PaymentCancel />} />
        <Route path="/invoice/:token" element={<ClientInvoice />} />
        <Route path="/proposal/:token" element={<ClientProposal />} />
        <Route path="/contract/:token" element={<ClientContract />} />
        <Route path="/client/project/:token" element={<ClientProjectHub />} />

        {/* Admin Routes */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/forgot-password" element={<AdminPasswordReset />} />
        <Route path="/admin/reset-password/:token" element={<AdminPasswordReset />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="tasks" element={<AdminTasks />} />
          <Route path="messages" element={<AdminMessages />} />
          <Route path="portfolio" element={<AdminPortfolio />} />
          <Route path="blog" element={<AdminBlog />} />
          <Route path="team" element={<AdminTeam />} />
          <Route path="clients" element={<AdminClients />} />
          <Route path="pricing" element={<AdminPricing />} />
          <Route path="departments" element={<AdminDepartments />} />
          <Route path="content" element={<AdminContent />} />
          <Route path="media" element={<AdminMedia />} />
          <Route path="newsletter" element={<AdminNewsletter />} />
          <Route path="payments" element={<AdminPayments />} />
          <Route path="audit" element={<AdminAuditLog />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="account" element={<AdminAccount />} />
        </Route>

        <Route path="/newsletter/confirm/:token" element={<NewsletterStatus mode="confirm" />} />
        <Route path="/newsletter/unsubscribe/:token" element={<NewsletterStatus mode="unsubscribe" />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>
    </>
  );
};

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
    <I18nProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <DynamicFavicon />
          <Toaster />
          <Sonner />
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <AppRoutes />
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </I18nProvider>
  </ThemeProvider>
);

export default App;
