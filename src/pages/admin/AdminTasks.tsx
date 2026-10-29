import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest, ENDPOINTS } from "@/lib/api";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AdminDataTable } from "@/components/admin/AdminDataTable";
import { EngagementCommandCenter } from "@/components/admin/EngagementCommandCenter";
import {
  List as ListIcon, LayoutGrid, Eye, Search, Filter, ArrowUpDown,
  Inbox, FileSearch, FileText, FileCheck, CreditCard, Rocket, CheckCircle2, XCircle,
  Clock, DollarSign, Tag, User, Building
} from "lucide-react";

interface StatusHistory {
  status: string;
  note?: string;
  updatedAt?: string;
}

interface TaskRequest {
  _id: string;
  name: string;
  email: string;
  company?: string;
  projectTitle?: string;
  service: string;
  budget?: string;
  timeline?: string;
  description: string;
  priority?: string;
  techStack?: string;
  status: string;
  statusHistory?: StatusHistory[];
  trackingToken?: string;
  proposalId?: any;
  contractToken?: string;
  contractSignedAt?: string;
  createdAt: string;
}

const LIFECYCLE_STAGES = [
  { id: "new", label: "Request", desc: "New inquiries", icon: Inbox, color: "text-blue-500", bg: "bg-blue-500/10 border-blue-500/20" },
  { id: "in_review", label: "Review", desc: "Engineering evaluation", icon: FileSearch, color: "text-purple-500", bg: "bg-purple-500/10 border-purple-500/20" },
  { id: "proposal_sent", label: "Proposal", desc: "Proposal drafted & sent", icon: FileText, color: "text-amber-500", bg: "bg-amber-500/10 border-amber-500/20" },
  { id: "contract_sent", label: "Contract", desc: "Contract pending signature", icon: FileCheck, color: "text-orange-500", bg: "bg-orange-500/10 border-orange-500/20" },
  { id: "contract_signed", label: "Signed", desc: "Contract signed, awaiting deposit", icon: CreditCard, color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/20" },
  { id: "in_progress", label: "Project", desc: "Active engineering sprint", icon: Rocket, color: "text-indigo-500", bg: "bg-indigo-500/10 border-indigo-500/20" },
  { id: "completed", label: "Completed", desc: "Delivered & signed off", icon: CheckCircle2, color: "text-green-500", bg: "bg-green-500/10 border-green-500/20" },
  { id: "cancelled", label: "Cancelled", desc: "Closed or inactive", icon: XCircle, color: "text-zinc-500", bg: "bg-zinc-500/10 border-zinc-500/20" },
];

const TABS = [
  { id: "all", label: "All Engagements" },
  { id: "new", label: "New Requests" },
  { id: "in_review", label: "In Review" },
  { id: "proposal_sent", label: "Proposal Sent" },
  { id: "contract_sent", label: "Contract Sent" },
  { id: "contract_signed", label: "Contract Signed" },
  { id: "in_progress", label: "Active Project" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
];

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 1) return "Just now";
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export const AdminTasks = () => {
  const [tasks, setTasks] = useState<TaskRequest[]>([]);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [sortOption, setSortOption] = useState<"newest" | "oldest" | "budget">("newest");
  const [viewMode, setViewMode] = useState<"board" | "list">("board");
  const [selectedTask, setSelectedTask] = useState<TaskRequest | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchTasks = async () => {
    setLoading(true);
    const { data } = await apiRequest<{ tasks: TaskRequest[] }>(ENDPOINTS.TASK_REQUEST_LIST);
    if (data?.tasks) {
      setTasks(data.tasks);
      if (selectedTask) {
        const updated = data.tasks.find((t) => t._id === selectedTask._id);
        if (updated) setSelectedTask(updated);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const handleOpenWorkspace = (task: TaskRequest) => {
    setSelectedTask(task);
    setDrawerOpen(true);
  };

  const services = useMemo(() => {
    const set = new Set<string>();
    tasks.forEach((t) => { if (t.service) set.add(t.service); });
    return ["all", ...Array.from(set)];
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks
      .filter((t) => {
        // Tabs and columns use the backend status names directly
        const matchesTab = activeTab === "all" || t.status === activeTab;

        const matchesService = serviceFilter === "all" || t.service === serviceFilter;
        const matchesPriority = priorityFilter === "all" || (t.priority || "normal").toLowerCase() === priorityFilter.toLowerCase();

        const query = search.toLowerCase();
        const matchesSearch =
          !search ||
          t.name.toLowerCase().includes(query) ||
          t.email.toLowerCase().includes(query) ||
          t.service.toLowerCase().includes(query) ||
          (t.projectTitle && t.projectTitle.toLowerCase().includes(query)) ||
          (t.company && t.company.toLowerCase().includes(query));

        return matchesTab && matchesService && matchesPriority && matchesSearch;
      })
      .sort((a, b) => {
        if (sortOption === "newest") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        if (sortOption === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        if (sortOption === "budget") {
          const numA = parseInt((a.budget || "0").replace(/[^0-9]/g, "")) || 0;
          const numB = parseInt((b.budget || "0").replace(/[^0-9]/g, "")) || 0;
          return numB - numA;
        }
        return 0;
      });
  }, [tasks, activeTab, serviceFilter, priorityFilter, search, sortOption]);

  const tabsWithCounts = TABS.map((tab) => {
    const count = tab.id === "all" ? tasks.length : tasks.filter((t) => t.status === tab.id).length;
    return { ...tab, count };
  });

  return (
    <div className="space-y-6 font-sans">
      {/* Workspace Drawer */}
      <EngagementCommandCenter
        request={selectedTask}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onRefresh={fetchTasks}
      />

      {/* Header */}
      <AdminPageHeader
        title="Kanban Lifecycle & Engagement Board"
        description="Full lifecycle client pipeline: inquiry tracking, AI proposals, contracts, payments, and project sprints."
        actions={
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-muted/60 border border-border/60 rounded-lg p-0.5 shadow-2xs">
              <button
                onClick={() => setViewMode("board")}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  viewMode === "board"
                    ? "bg-background text-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" /> Kanban Board
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  viewMode === "list"
                    ? "bg-background text-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <ListIcon className="h-3.5 w-3.5" /> Data Table
              </button>
            </div>
          </div>
        }
      />

      {/* Filters Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-card border border-border/50 rounded-xl shadow-2xs text-xs">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          {/* Search */}
          <div className="relative min-w-[220px] flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search client, company, project…"
              className="w-full bg-background border border-border/60 rounded-lg pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary font-sans"
            />
          </div>

          {/* Service Filter */}
          <div className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <select
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value)}
              className="bg-background border border-border/60 rounded-lg px-2.5 py-1.5 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="all">All Services ({tasks.length})</option>
              {services.filter((s) => s !== "all").map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Priority Filter */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="bg-background border border-border/60 rounded-lg px-2.5 py-1.5 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="all">All Priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
          </select>
        </div>

        {/* Sort Option */}
        <div className="flex items-center gap-1.5">
          <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value as any)}
            className="bg-background border border-border/60 rounded-lg px-2.5 py-1.5 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="newest">Sort: Newest First</option>
            <option value="oldest">Sort: Oldest First</option>
            <option value="budget">Sort: Budget High-Low</option>
          </select>
        </div>
      </div>

      {/* VIEW RENDERER */}
      {viewMode === "board" ? (
        /* KANBAN BOARD HORIZONTAL LIFECYCLE VIEW */
        <div className="overflow-x-auto pb-4 pt-1 border border-border/50 rounded-xl bg-card/40 p-4">
          <div className="flex items-start gap-4 min-w-[2400px]">
            {LIFECYCLE_STAGES.map((stage) => {
              const StageIcon = stage.icon;
              const stageTasks = filteredTasks.filter((t) => t.status === stage.id);

              return (
                <div
                  key={stage.id}
                  className="w-[280px] shrink-0 bg-card border border-border/60 rounded-xl flex flex-col shadow-2xs max-h-[calc(100vh-230px)] overflow-hidden"
                >
                  {/* Column Header */}
                  <div className={`p-3.5 border-b flex items-center justify-between ${stage.bg}`}>
                    <div className="flex items-center gap-2">
                      <StageIcon className={`h-4 w-4 ${stage.color}`} />
                      <div>
                        <h3 className="text-xs font-bold text-foreground font-display flex items-center gap-1.5">
                          {stage.label}
                        </h3>
                        <p className="text-[10px] text-muted-foreground leading-tight">{stage.desc}</p>
                      </div>
                    </div>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-background border border-border/40 font-bold text-foreground">
                      {stageTasks.length}
                    </span>
                  </div>

                  {/* Column Cards Container */}
                  <div className="p-3 overflow-y-auto space-y-3 flex-1 min-h-[400px]">
                    {loading ? (
                      <div className="space-y-3">
                        {[1, 2].map((i) => (
                          <div key={i} className="h-28 rounded-lg bg-muted/40 animate-pulse" />
                        ))}
                      </div>
                    ) : stageTasks.length === 0 ? (
                      <div className="h-40 flex flex-col items-center justify-center text-center p-4 border border-dashed border-border/50 rounded-lg text-muted-foreground">
                        <StageIcon className="h-6 w-6 text-muted-foreground/40 mb-1.5" />
                        <p className="text-xs font-medium">No requests</p>
                        <p className="text-[10px] opacity-70">Stage is currently empty</p>
                      </div>
                    ) : (
                      <AnimatePresence mode="popLayout">
                        {stageTasks.map((t) => {
                          const priority = (t.priority || "normal").toLowerCase();
                          const isUrgent = priority === "urgent" || priority === "high";

                          return (
                            <motion.div
                              key={t._id}
                              layout
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              whileHover={{ y: -3, transition: { duration: 0.15 } }}
                              onClick={() => handleOpenWorkspace(t)}
                              className="p-3.5 rounded-xl border border-border/60 bg-background hover:border-primary/50 hover:shadow-md transition-all cursor-pointer space-y-3 group relative overflow-hidden"
                            >
                              {/* Accent Line */}
                              <div className={`absolute top-0 left-0 right-0 h-1 ${
                                isUrgent ? "bg-red-500" : stage.color.replace("text-", "bg-")
                              }`} />

                              {/* Card Header: Client & Priority */}
                              <div className="flex items-start justify-between gap-2 pt-1">
                                <div>
                                  <div className="font-bold text-xs text-foreground group-hover:text-primary transition-colors flex items-center gap-1.5">
                                    <User className="h-3 w-3 text-muted-foreground shrink-0" />
                                    <span className="truncate max-w-[140px]">{t.name}</span>
                                  </div>
                                  {t.company && (
                                    <div className="text-[10px] text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                                      <Building className="h-2.5 w-2.5 text-muted-foreground/60 shrink-0" />
                                      <span>{t.company}</span>
                                    </div>
                                  )}
                                </div>

                                {isUrgent ? (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-red-500/10 text-red-500 border border-red-500/20 uppercase shrink-0">
                                    {t.priority}
                                  </span>
                                ) : (
                                  <AdminStatusBadge status={t.status} size="sm" />
                                )}
                              </div>

                              {/* Project Title / Service */}
                              <div>
                                <h4 className="text-xs font-semibold text-foreground leading-snug line-clamp-1">
                                  {t.projectTitle || t.service}
                                </h4>
                                <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
                                  <Tag className="h-2.5 w-2.5 text-primary/70 shrink-0" />
                                  <span className="truncate">{t.service}</span>
                                </div>
                              </div>

                              {/* Card Description Snippet */}
                              <p className="text-[11px] text-muted-foreground/90 line-clamp-2 leading-relaxed bg-muted/20 p-2 rounded-lg border border-border/30">
                                {t.description}
                              </p>

                              {/* Footer: Budget & Time Ago */}
                              <div className="flex items-center justify-between text-[11px] pt-2 border-t border-border/40">
                                <div className="flex items-center gap-1 font-mono font-bold text-foreground bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded border border-emerald-500/20">
                                  <DollarSign className="h-3 w-3 shrink-0" />
                                  <span>{t.budget || "TBD"}</span>
                                </div>

                                <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
                                  <Clock className="h-3 w-3 shrink-0 text-muted-foreground/70" />
                                  <span>{formatTimeAgo(t.createdAt)}</span>
                                </div>
                              </div>
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* DATA TABLE LIST VIEW */
        <AdminDataTable
          searchQuery={search}
          onSearchChange={setSearch}
          searchPlaceholder="Filter by client name, email, or service…"
          tabs={tabsWithCounts}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          loading={loading}
          isEmpty={filteredTasks.length === 0}
          emptyTitle="No engagements match criteria"
          emptyDescription="Try adjusting your status filter or search keywords."
          onRefresh={fetchTasks}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 border-b border-border/40 text-muted-foreground font-mono uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Project / Service</th>
                  <th className="px-4 py-3">Stage Status</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Budget</th>
                  <th className="px-4 py-3">Submitted</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filteredTasks.map((t) => (
                  <tr
                    key={t._id}
                    onClick={() => handleOpenWorkspace(t)}
                    className="hover:bg-muted/40 transition-colors cursor-pointer group"
                  >
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-foreground group-hover:text-primary transition-colors">
                        {t.name}
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono">{t.email}</div>
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="font-medium text-foreground">
                        {t.projectTitle || t.service}
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono">{t.service}</div>
                    </td>

                    <td className="px-4 py-3.5">
                      <AdminStatusBadge status={t.status} />
                    </td>

                    <td className="px-4 py-3.5 font-mono">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        (t.priority || "").toLowerCase() === "urgent"
                          ? "bg-red-500/10 text-red-500 border border-red-500/20"
                          : (t.priority || "").toLowerCase() === "high"
                          ? "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {t.priority || "normal"}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 font-mono font-semibold text-foreground">
                      {t.budget || "TBD"}
                    </td>

                    <td className="px-4 py-3.5 text-muted-foreground font-mono">
                      {new Date(t.createdAt).toLocaleDateString()}
                    </td>

                    <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleOpenWorkspace(t)}
                        className="px-2.5 py-1 rounded-md bg-muted hover:bg-primary hover:text-primary-foreground text-xs font-medium transition-all inline-flex items-center gap-1"
                      >
                        <Eye className="h-3.5 w-3.5" /> Workspace
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdminDataTable>
      )}
    </div>
  );
};

export default AdminTasks;
