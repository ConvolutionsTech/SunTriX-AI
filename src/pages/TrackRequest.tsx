import { useState, useEffect } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { apiRequest, ENDPOINTS } from "../lib/api";
import { ArrowLeft, CheckCircle2, Clock, Mail, Search, CheckCircle } from "lucide-react";
import Layout from "../components/Layout";

type TaskStatus = "new" | "in_review" | "proposal_sent" | "contract_sent" | "contract_signed" | "in_progress" | "completed" | "cancelled";

// GET /task-requests/track/:token returns a client-safe timeline (internal notes are stripped)
interface StatusTimelineEntry {
  status: TaskStatus;
  updatedAt: string;
  note?: string;
}

interface TrackedTask {
  name: string;
  projectTitle: string;
  service: string;
  status: TaskStatus;
  statusTimeline: StatusTimelineEntry[];
  createdAt: string;
  updatedAt: string;
}

const statusSteps = [
  { value: "new", label: "Request Received", desc: "We've received your project brief." },
  { value: "in_review", label: "In Review", desc: "Our team is reviewing your requirements." },
  { value: "proposal_sent", label: "Proposal Sent", desc: "We've sent a proposal to your email for review." },
  { value: "contract_sent", label: "Contract Sent", desc: "Proposal accepted. A service agreement has been sent to your email." },
  { value: "contract_signed", label: "Contract Signed", desc: "Service agreement signed. Awaiting kickoff." },
  { value: "in_progress", label: "In Progress", desc: "We are actively working on your project." },
  { value: "completed", label: "Completed", desc: "Project delivered successfully." },
];

const TrackRequest = () => {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const justPaid = searchParams.get("paid") === "1";
  const [task, setTask] = useState<TrackedTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inputToken, setInputToken] = useState("");

  const fetchTask = async (searchToken: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: apiError } = await apiRequest<TrackedTask>(ENDPOINTS.TASK_REQUEST_TRACK(searchToken));
      if (apiError || !data) {
        setError("Invalid tracking link or project not found.");
        setTask(null);
      } else {
        setTask(data);
      }
    } catch (err) {
      setError("An error occurred while fetching your project status.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchTask(token);
    } else {
      setLoading(false);
    }
  }, [token]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputToken.trim()) {
      window.history.pushState({}, "", `/track/${inputToken.trim()}`);
      fetchTask(inputToken.trim());
    }
  };

  const currentStepIndex = task 
    ? task.status === "cancelled" 
      ? -1 
      : statusSteps.findIndex(s => s.value === task.status)
    : -1;

  return (
    <Layout>
      <div className="min-h-screen bg-background pt-32 pb-24 px-6">
        <div className="mx-auto max-w-3xl">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors mb-8">
            <ArrowLeft className="h-4 w-4" /> Back to Home
          </Link>

          {!token && !task && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-card border border-border rounded-2xl p-8 md:p-12 text-center"
            >
              <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Search className="h-8 w-8 text-primary" />
              </div>
              <h1 className="text-3xl font-display font-bold text-foreground mb-4">Track Your Project</h1>
              <p className="text-muted-foreground mb-8 max-w-md mx-auto">
                Enter the tracking token you received via email to check the status of your task request.
              </p>
              <form onSubmit={handleSearch} className="flex gap-3 max-w-md mx-auto">
                <input 
                  type="text" 
                  value={inputToken}
                  onChange={(e) => setInputToken(e.target.value)}
                  placeholder="e.g. 8f4b2..." 
                  className="flex-1 bg-background border border-border rounded-lg px-4 py-3 text-foreground outline-none focus:border-primary transition-colors"
                  required
                />
                <button type="submit" className="bg-primary text-primary-foreground px-6 py-3 rounded-lg font-medium hover:opacity-90 transition-opacity">
                  Track
                </button>
              </form>
            </motion.div>
          )}

          {loading && token && (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin mb-4" />
              <p className="text-muted-foreground">Loading project status...</p>
            </div>
          )}

          {error && token && !loading && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-destructive/10 border border-destructive/20 rounded-2xl p-8 text-center"
            >
              <div className="h-16 w-16 bg-destructive/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Search className="h-8 w-8 text-destructive" />
              </div>
              <h2 className="text-xl font-bold text-destructive mb-2">Project Not Found</h2>
              <p className="text-destructive/80 mb-6">{error}</p>
              <Link to="/contact" className="text-primary font-medium hover:underline">Contact Support</Link>
            </motion.div>
          )}

          {task && !loading && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              {/* Payment Confirmed Banner */}
              {justPaid && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6 flex items-start gap-4"
                >
                  <div className="h-10 w-10 bg-emerald-500/20 rounded-full flex items-center justify-center shrink-0">
                    <CheckCircle className="h-5 w-5 text-emerald-500" />
                  </div>
                  <div>
                    <h3 className="font-bold text-emerald-500 mb-1">Payment Confirmed — Project is Now Active!</h3>
                    <p className="text-sm text-emerald-500/80">
                      Thank you for your payment. Your project manager will contact you within 2 business hours to schedule a kickoff call.
                      Check your inbox for a receipt and next-steps email.
                    </p>
                  </div>
                </motion.div>
              )}

              {/* Header */}
              <div className="bg-card border border-border rounded-2xl p-8">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div>
                    <span className="text-xs font-semibold text-primary uppercase tracking-wider mb-2 block">Project Tracker</span>
                    <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground mb-2">
                      {task.projectTitle || "Project Request"}
                    </h1>
                    <p className="text-muted-foreground text-sm">
                      Requested by {task.name} on {new Date(task.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-4 border border-border/50 text-center md:min-w-[150px]">
                    <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Service</p>
                    <p className="font-medium text-foreground">{task.service}</p>
                  </div>
                </div>
              </div>

              {/* Status Pipeline */}
              <div className="bg-card border border-border rounded-2xl p-8">
                <h3 className="text-lg font-bold text-foreground mb-8">Current Status</h3>
                
                {task.status === "cancelled" ? (
                  <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-6 flex items-start gap-4">
                    <div className="h-10 w-10 bg-destructive/20 rounded-full flex items-center justify-center shrink-0">
                      <Search className="h-5 w-5 text-destructive" />
                    </div>
                    <div>
                      <h4 className="font-bold text-destructive">Project Cancelled</h4>
                      <p className="text-sm text-destructive/80 mt-1">This request has been cancelled. If you believe this is an error, please contact us.</p>
                    </div>
                  </div>
                ) : (
                  <div className="relative">
                    {/* Desktop Pipeline */}
                    <div className="hidden md:flex justify-between relative z-10">
                      {statusSteps.map((step, idx) => {
                        const isCompleted = idx <= currentStepIndex;
                        const isCurrent = idx === currentStepIndex;
                        
                        return (
                          <div key={step.value} className="flex flex-col items-center text-center w-32 relative">
                            <div className={`h-10 w-10 rounded-full flex items-center justify-center mb-4 transition-colors z-10 bg-card border-2
                              ${isCompleted ? "border-primary text-primary" : "border-border text-muted-foreground"}
                              ${isCurrent ? "ring-4 ring-primary/20 bg-primary/5" : ""}
                            `}>
                              {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
                            </div>
                            <h4 className={`text-sm font-semibold mb-1 ${isCompleted ? "text-foreground" : "text-muted-foreground"}`}>{step.label}</h4>
                            <p className="text-xs text-muted-foreground">{step.desc}</p>
                          </div>
                        );
                      })}
                    </div>
                    {/* Connecting Line Desktop */}
                    <div className="hidden md:block absolute top-5 left-16 right-16 h-0.5 bg-border -z-0">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max(0, (currentStepIndex / (statusSteps.length - 1)) * 100)}%` }}
                        className="h-full bg-primary"
                      />
                    </div>

                    {/* Mobile Pipeline */}
                    <div className="md:hidden space-y-6 relative z-10 pl-4">
                      {statusSteps.map((step, idx) => {
                        const isCompleted = idx <= currentStepIndex;
                        const isCurrent = idx === currentStepIndex;
                        
                        return (
                          <div key={step.value} className="flex gap-4 relative">
                            <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 z-10 bg-card border-2
                              ${isCompleted ? "border-primary text-primary" : "border-border text-muted-foreground"}
                              ${isCurrent ? "ring-4 ring-primary/20 bg-primary/5" : ""}
                            `}>
                              {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                            </div>
                            <div>
                              <h4 className={`text-sm font-semibold mb-1 ${isCompleted ? "text-foreground" : "text-muted-foreground"}`}>{step.label}</h4>
                              <p className="text-xs text-muted-foreground">{step.desc}</p>
                            </div>
                          </div>
                        );
                      })}
                      {/* Connecting Line Mobile */}
                      <div className="absolute top-4 bottom-4 left-8 w-0.5 bg-border -z-0">
                         <motion.div 
                          initial={{ height: 0 }}
                          animate={{ height: `${Math.max(0, (currentStepIndex / (statusSteps.length - 1)) * 100)}%` }}
                          className="w-full bg-primary"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Timeline History */}
              {task.statusTimeline && task.statusTimeline.length > 0 && (
                <div className="bg-card border border-border rounded-2xl p-8">
                  <h3 className="text-lg font-bold text-foreground mb-6">Updates</h3>
                  <div className="space-y-6 border-l-2 border-border ml-2 pl-6">
                    {task.statusTimeline.map((h, i) => {
                      const stepInfo = statusSteps.find(s => s.value === h.status) || { label: "Status Updated", desc: "" };
                      return (
                        <div key={i} className="relative">
                          <span className="absolute -left-[31px] top-1 h-3 w-3 rounded-full border-2 border-card bg-primary"></span>
                          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 mb-2">
                            <h4 className="font-semibold text-foreground">{stepInfo.label}</h4>
                            <span className="text-xs text-muted-foreground">{new Date(h.updatedAt).toLocaleString()}</span>
                          </div>
                          {h.note && (
                            <div className="bg-muted/30 rounded-lg p-4 border border-border">
                              <p className="text-sm text-foreground">{h.note}</p>
                            </div>
                          )}
                        </div>
                      )
                    }).reverse()}
                  </div>
                </div>
              )}

              {/* Support */}
              <div className="bg-gradient-to-r from-primary/10 to-transparent border border-primary/20 rounded-2xl p-8 flex flex-col md:flex-row items-center justify-between gap-6">
                <div>
                  <h3 className="font-bold text-foreground mb-1">Need help?</h3>
                  <p className="text-sm text-muted-foreground">Have questions about your project status?</p>
                </div>
                <Link to="/contact" className="bg-card border border-border hover:border-primary text-foreground px-6 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
                  <Mail className="h-4 w-4" /> Contact Support
                </Link>
              </div>

            </motion.div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default TrackRequest;
