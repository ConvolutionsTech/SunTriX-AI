import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { apiRequest, ENDPOINTS } from "@/lib/api";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { EmailHealthPanel, type EmailHealth } from "@/components/admin/EmailHealthPanel";
import { AiUsageCard } from "@/components/admin/AiUsageCard";
import {
  AreaChart, Area, BarChart, Bar, ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";
import {
  ClipboardList, MessageSquare, DollarSign, Clock, CheckCircle2,
  AlertCircle, Users, Activity, ArrowRight, RefreshCw, Plus, TrendingUp, BarChart3
} from "lucide-react";

interface DashboardStats {
  totalTasks: number;
  pendingTasks: number;
  completedTasks: number;
  totalContacts: number;
  unreadContacts: number;
  revenue: number;
  totalPortfolio: number;
  publishedPortfolio: number;
  totalTestimonials: number;
  totalSubscribers: number;
  email?: EmailHealth;
}

interface TrendPoint {
  date: string;
  tasks: number;
  messages: number;
  subscribers: number;
}

interface PipelineItem {
  status: string;
  count: number;
}

interface ServiceItem {
  service: string;
  count: number;
}

interface FeedItem {
  type: string;
  title: string;
  subtitle: string;
  status: string;
  at: string;
}

interface ActivityData {
  trendChart: TrendPoint[];
  taskPipeline: PipelineItem[];
  topServices: ServiceItem[];
  feed: FeedItem[];
}

export const AdminDashboard = () => {
  const [stats, setStats] = useState<DashboardStats>({
    totalTasks: 0,
    pendingTasks: 0,
    completedTasks: 0,
    totalContacts: 0,
    unreadContacts: 0,
    revenue: 0,
    totalPortfolio: 0,
    publishedPortfolio: 0,
    totalTestimonials: 0,
    totalSubscribers: 0,
  });
  const [activity, setActivity] = useState<ActivityData | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    const { data: s } = await apiRequest<DashboardStats>(ENDPOINTS.ADMIN_DASHBOARD_STATS);
    if (s) setStats(s);

    const { data: act } = await apiRequest<ActivityData>(ENDPOINTS.ADMIN_ACTIVITY(days));
    if (act) setActivity(act);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [days]);

  const currentDateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  const trendData = (activity?.trendChart || []).map((d) => ({
    ...d,
    label: d.date.slice(5),
  }));

  return (
    <div className="space-y-8 font-sans">
      {/* Header */}
      <AdminPageHeader
        title="Operations Platform Overview"
        description={`Today is ${currentDateStr}. Real-time reporting, conversion pipeline, and client activity.`}
        actions={
          <div className="flex items-center gap-2">
            <div className="flex bg-muted/40 p-1 rounded-lg border border-border/40 gap-0.5">
              {[7, 30, 90].map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                    days === d ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
            <button
              onClick={loadData}
              disabled={loading}
              className="p-1.5 rounded-lg border border-border/60 bg-background text-xs font-semibold text-foreground hover:bg-muted transition-all"
              title="Refresh Dashboard"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-primary" : ""}`} />
            </button>
          </div>
        }
      />

      {stats.email && <EmailHealthPanel health={stats.email} onChanged={loadData} />}
      <AiUsageCard />

      {/* SECTION 1: ACTION REQUIRED QUEUE */}
      <div className="space-y-3">
        <h2 className="text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5 text-primary" /> Action Required Queue
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl border border-border/60 bg-card flex items-start justify-between gap-4 shadow-xs">
            <div className="space-y-1">
              <span className="text-xs font-mono text-muted-foreground">Client Briefs</span>
              <p className="text-lg font-semibold text-foreground">
                {stats.pendingTasks} New / Pending Requests
              </p>
              <p className="text-xs text-muted-foreground leading-normal">
                Requires proposal drafting or stage review.
              </p>
            </div>
            <Link
              to="/admin/tasks"
              className="p-1.5 rounded-lg bg-muted text-foreground hover:bg-primary hover:text-primary-foreground transition-all shrink-0 mt-1"
            >
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="p-4 rounded-xl border border-border/60 bg-card flex items-start justify-between gap-4 shadow-xs">
            <div className="space-y-1">
              <span className="text-xs font-mono text-muted-foreground">Inquiries</span>
              <p className="text-lg font-semibold text-foreground">
                {stats.unreadContacts} Unread Messages
              </p>
              <p className="text-xs text-muted-foreground leading-normal">
                Incoming contact forms from prospective clients.
              </p>
            </div>
            <Link
              to="/admin/messages"
              className="p-1.5 rounded-lg bg-muted text-foreground hover:bg-primary hover:text-primary-foreground transition-all shrink-0 mt-1"
            >
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="p-4 rounded-xl border border-border/60 bg-card flex items-start justify-between gap-4 shadow-xs">
            <div className="space-y-1">
              <span className="text-xs font-mono text-muted-foreground">Lifecycle Success</span>
              <p className="text-lg font-semibold text-foreground">
                {stats.completedTasks} Completed Projects
              </p>
              <p className="text-xs text-muted-foreground leading-normal">
                Engagements delivered and signed off.
              </p>
            </div>
            <Link
              to="/admin/tasks"
              className="p-1.5 rounded-lg bg-muted text-foreground hover:bg-primary hover:text-primary-foreground transition-all shrink-0 mt-1"
            >
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* SECTION 2: METRIC HIGHLIGHT COUNTERS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-2 border-y border-border/40">
        <div className="space-y-1 py-2">
          <span className="text-xs font-mono text-muted-foreground">Total Revenue</span>
          <p className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
            ${stats.revenue.toLocaleString()}
          </p>
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
            <TrendingUp className="h-3 w-3" /> Stripe Verified Checkout
          </p>
        </div>

        <div className="space-y-1 py-2">
          <span className="text-xs font-mono text-muted-foreground">Total Engagements</span>
          <p className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
            {stats.totalTasks}
          </p>
          <p className="text-[11px] text-muted-foreground font-medium">
            {stats.pendingTasks} pending action
          </p>
        </div>

        <div className="space-y-1 py-2">
          <span className="text-xs font-mono text-muted-foreground">Published Portfolio</span>
          <p className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
            {stats.publishedPortfolio}
          </p>
          <p className="text-[11px] text-muted-foreground font-medium">
            of {stats.totalPortfolio} total items
          </p>
        </div>

        <div className="space-y-1 py-2">
          <span className="text-xs font-mono text-muted-foreground">Newsletter Audience</span>
          <p className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
            {stats.totalSubscribers}
          </p>
          <p className="text-[11px] text-blue-600 dark:text-blue-400 font-medium">
            Active email subscribers
          </p>
        </div>
      </div>

      {/* SECTION 3: VISUAL CHARTS & REPORTING */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trend Area Chart (Spans 2 columns) */}
        <div className="lg:col-span-2 p-5 rounded-xl border border-border/50 bg-card space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-border/40 pb-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <h3 className="text-xs font-mono font-semibold text-foreground uppercase tracking-wider">
                Engagement & Inquiries Trend ({days} Days)
              </h3>
            </div>
          </div>

          {loading ? (
            <div className="h-56 flex items-center justify-center">
              <div className="h-6 w-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorTasks" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" stroke="#888888" fontSize={10} tickLine={false} />
                <YAxis stroke="#888888" fontSize={10} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a", borderRadius: "8px", fontSize: "12px" }}
                />
                <Area type="monotone" dataKey="tasks" stroke="#f97316" fillOpacity={1} fill="url(#colorTasks)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Client Pipeline Distribution Bar Chart */}
        <div className="p-5 rounded-xl border border-border/50 bg-card space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-border/40 pb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <h3 className="text-xs font-mono font-semibold text-foreground uppercase tracking-wider">
                Conversion Pipeline
              </h3>
            </div>
          </div>

          {activity?.taskPipeline ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={activity.taskPipeline} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="status" stroke="#888888" fontSize={9} tickLine={false} />
                <YAxis stroke="#888888" fontSize={10} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a", borderRadius: "8px", fontSize: "12px" }}
                />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-56 flex items-center justify-center text-xs text-muted-foreground font-mono">
              Loading pipeline data…
            </div>
          )}
        </div>
      </div>

      {/* SECTION 4: OPERATIONAL ACTIVITY STREAM */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-border/40 pb-2">
          <h3 className="text-xs font-mono font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-primary" /> Operational Event Log
          </h3>
          <span className="text-[11px] text-muted-foreground font-mono">Live Feed</span>
        </div>

        {!activity || activity.feed.length === 0 ? (
          <p className="text-xs text-muted-foreground font-mono py-8 text-center">
            No recent activity recorded.
          </p>
        ) : (
          <div className="divide-y divide-border/40">
            {activity.feed.slice(0, 6).map((item, idx) => (
              <div key={idx} className="py-3 flex items-center justify-between gap-4 hover:bg-muted/30 px-2 rounded-lg transition-colors">
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-foreground">{item.title}</p>
                  <p className="text-[11px] text-muted-foreground">{item.subtitle}</p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <AdminStatusBadge status={item.status} size="sm" />
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {new Date(item.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
