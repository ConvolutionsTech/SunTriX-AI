import React from "react";

export type StatusCategory =
  | "success"
  | "warning"
  | "info"
  | "error"
  | "neutral";

interface AdminStatusBadgeProps {
  status: string;
  category?: StatusCategory;
  size?: "sm" | "md";
}

const statusMap: Record<string, { label: string; category: StatusCategory }> = {
  // Success states
  paid: { label: "Paid", category: "success" },
  completed: { label: "Completed", category: "success" },
  accepted: { label: "Accepted", category: "success" },
  signed: { label: "Signed", category: "success" },
  active: { label: "Active", category: "success" },
  published: { label: "Published", category: "success" },
  sent: { label: "Sent", category: "success" },

  // Warning / In progress states
  pending: { label: "Pending", category: "warning" },
  submitted: { label: "Submitted", category: "warning" },
  new: { label: "New Request", category: "warning" },
  in_review: { label: "In Review", category: "warning" },
  reviewing: { label: "Reviewing", category: "warning" },
  proposal_sent: { label: "Proposal Sent", category: "info" },
  contract_sent: { label: "Contract Sent", category: "info" },
  contract_signed: { label: "Contract Signed", category: "success" },
  changes_requested: { label: "Changes Requested", category: "warning" },
  processing: { label: "Processing", category: "info" },
  in_progress: { label: "In Progress", category: "info" },

  // Error / Cancelled states
  failed: { label: "Failed", category: "error" },
  cancelled: { label: "Cancelled", category: "error" },
  refunded: { label: "Refunded", category: "error" },
  expired: { label: "Expired", category: "error" },

  // Neutral / Draft states
  draft: { label: "Draft", category: "neutral" },
  unread: { label: "Unread", category: "warning" },
  read: { label: "Read", category: "neutral" },
};

const categoryStyles: Record<StatusCategory, string> = {
  success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  info: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  error: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  neutral: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20",
};

export const AdminStatusBadge: React.FC<AdminStatusBadgeProps> = ({
  status,
  category,
  size = "md",
}) => {
  const normalized = status.toLowerCase();
  const mapped = statusMap[normalized] || {
    label: status.replace("_", " "),
    category: category || "neutral",
  };

  const finalCategory = category || mapped.category;
  const style = categoryStyles[finalCategory];

  const sizeClasses = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-0.5 text-xs";

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full border ${sizeClasses} ${style} transition-colors`}
    >
      <span className="capitalize">{mapped.label}</span>
    </span>
  );
};
