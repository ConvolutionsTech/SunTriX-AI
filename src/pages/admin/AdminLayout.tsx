import { useState } from "react";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard, ClipboardList, MessageSquare, Settings,
  LogOut, Menu, X, ChevronRight, ChevronDown, Layers, Image, Users,
  Shield, CreditCard, Search, Moon, Sun, Briefcase, FileText,
  Building2, DollarSign, UserCheck, Sparkles
} from "lucide-react";
import { useNotifications } from "../../hooks/useNotifications";
import { AdminCommandPalette } from "@/components/admin/AdminCommandPalette";
import { useTheme } from "next-themes";
import { useAuth } from "@/lib/auth";
import { logout } from "@/lib/api";

interface NavItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
  badge?: number;
}

interface NavGroup {
  groupName: string;
  items: NavItem[];
}

const AdminLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [cmsExpanded, setCmsExpanded] = useState(true);
  const location = useLocation();
  const notifications = useNotifications();
  const { theme, setTheme } = useTheme();

  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />;
  }

  // Clearing the session re-renders this layout, which redirects to /admin/login
  const handleLogout = () => {
    void logout();
  };

  const navGroups: NavGroup[] = [
    {
      groupName: "Overview",
      items: [
        { icon: LayoutDashboard, label: "Dashboard", href: "/admin" },
      ],
    },
    {
      groupName: "Client Operations",
      items: [
        { icon: ClipboardList, label: "Requests & Lifecycle", href: "/admin/tasks", badge: notifications.newTasks },
        { icon: MessageSquare, label: "Messages", href: "/admin/messages", badge: notifications.unreadMessages },
      ],
    },
    {
      groupName: "Finance",
      items: [
        { icon: CreditCard, label: "Payments & Invoices", href: "/admin/payments" },
      ],
    },
    {
      groupName: "Marketing & CMS",
      items: [
        { icon: Layers, label: "Site Copy & Banners", href: "/admin/content" },
        { icon: Briefcase, label: "Portfolio Showcase", href: "/admin/portfolio" },
        { icon: FileText, label: "Blog & Articles", href: "/admin/blog" },
        { icon: UserCheck, label: "Client Directory", href: "/admin/clients" },
        { icon: Users, label: "Team Members", href: "/admin/team" },
        { icon: DollarSign, label: "Pricing Plans", href: "/admin/pricing" },
        { icon: Building2, label: "Departments", href: "/admin/departments" },
        { icon: Image, label: "Media Library", href: "/admin/media" },
        { icon: Users, label: "Newsletter", href: "/admin/newsletter", badge: notifications.newSubscribers },
      ],
    },
    {
      groupName: "System & Governance",
      items: [
        { icon: Settings, label: "Settings & AI Config", href: "/admin/settings" },
        { icon: Shield, label: "Audit Log", href: "/admin/audit" },
      ],
    },
  ];

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col md:flex-row bg-background text-foreground font-sans">
      <AdminCommandPalette />

      {/* Sidebar: Fixed height, independent scroll */}
      <aside
        className={`${
          sidebarOpen ? "w-60" : "w-16"
        } h-screen overflow-y-auto shrink-0 border-r border-border/50 bg-card transition-all duration-250 flex flex-col justify-between`}
      >
        <div className="space-y-4">
          {/* Top Branding */}
          <div className="p-4 border-b border-border/40 flex items-center justify-between sticky top-0 bg-card z-10">
            {sidebarOpen && (
              <Link to="/admin" className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center shadow-xs">
                  <span className="text-primary-foreground font-bold text-xs">S</span>
                </div>
                <div className="overflow-hidden">
                  <span className="text-xs font-bold tracking-tight block">SunTriX AI</span>
                  <span className="text-[10px] text-muted-foreground block -mt-0.5 font-mono">Operations Platform</span>
                </div>
              </Link>
            )}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>

          {/* Global Search Shortcut Trigger */}
          {sidebarOpen && (
            <div className="px-3 pt-1">
              <button
                onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-muted/40 border border-border/40 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-all font-mono"
              >
                <span className="flex items-center gap-2">
                  <Search className="h-3.5 w-3.5" /> Quick search…
                </span>
                <kbd className="px-1.5 py-0.5 rounded bg-background border border-border/60 text-[10px]">⌘K</kbd>
              </button>
            </div>
          )}

          {/* Navigation Groups */}
          <nav className="px-2.5 space-y-4">
            {navGroups.map((group) => (
              <div key={group.groupName} className="space-y-1">
                {sidebarOpen && (
                  <span className="px-2 text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider block mb-1">
                    {group.groupName}
                  </span>
                )}

                {group.items.map((item) => {
                  const isActive =
                    item.href === "/admin"
                      ? location.pathname === "/admin"
                      : location.pathname.startsWith(item.href);

                  return (
                    <Link
                      key={item.href}
                      to={item.href}
                      className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs transition-all font-medium ${
                        isActive
                          ? "bg-primary/10 text-primary font-semibold border-l-2 border-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                      title={!sidebarOpen ? item.label : undefined}
                    >
                      <item.icon className={`h-4 w-4 shrink-0 ${isActive ? "text-primary" : ""}`} />
                      {sidebarOpen && <span className="flex-1 truncate">{item.label}</span>}
                      {sidebarOpen && item.badge !== undefined && item.badge > 0 && (
                        <span className="bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>

        {/* Footer & User Session Utilities */}
        <div className="p-3 border-t border-border/40 space-y-2 sticky bottom-0 bg-card">
          {sidebarOpen && (
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-[11px] text-muted-foreground font-medium">Theme</span>
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="p-1 rounded-md bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="Toggle Theme"
              >
                {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              </button>
            </div>
          )}

          {sidebarOpen && user && (
            <div className="flex items-center gap-2 px-2 py-1">
              <div className="h-7 w-7 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                {(user.name || user.email || "?")[0]}
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-semibold text-foreground truncate">{user.name || user.email}</p>
                <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
              </div>
            </div>
          )}

          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors font-medium"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {sidebarOpen && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Main Workspace: Fixed height, independent scroll */}
      <div className="flex-1 h-screen overflow-y-auto bg-background p-6 md:p-8">
        <Outlet />
      </div>
    </div>
  );
};

export default AdminLayout;
