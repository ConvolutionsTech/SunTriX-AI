import { useState } from "react";
import { MailWarning } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { apiRequest, ENDPOINTS } from "@/lib/api";
import { toast } from "sonner";

export interface EmailHealth {
  configured: boolean;
  failedLast7Days: number;
}

interface FailedEmail {
  _id: string;
  template: string;
  to: string[];
  subject: string;
  error?: string;
  attempts: number;
  createdAt: string;
}

/** Warns when email can't be sent, and lets an admin retry failed deliveries. Renders nothing when all is well. */
export function EmailHealthPanel({ health, onChanged }: { health: EmailHealth; onChanged?: () => void }) {
  const [failed, setFailed] = useState<FailedEmail[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  if (health.configured && health.failedLast7Days === 0) return null;

  const showFailed = async () => {
    const { data, error } = await apiRequest<{ logs: FailedEmail[] }>(ENDPOINTS.ADMIN_EMAIL_LOG("failed"));
    if (error) setLoadError(error);
    else setFailed(data?.logs ?? []);
  };

  const retry = async (id: string) => {
    const { error } = await apiRequest(ENDPOINTS.ADMIN_EMAIL_RETRY(id), { method: "POST" });
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Email queued for another attempt");
    setFailed((list) => list?.filter((e) => e._id !== id) ?? null);
    onChanged?.();
  };

  return (
    <Alert variant="destructive">
      <MailWarning className="h-4 w-4" />
      <AlertTitle>{health.configured ? "Some emails could not be delivered" : "Email is not configured"}</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>
          {health.configured
            ? `${health.failedLast7Days} email${health.failedLast7Days === 1 ? "" : "s"} failed in the last 7 days after several attempts.`
            : "RESEND_API_KEY is not set on the server, so clients receive no proposals, contracts, invoices or receipts."}
          {!health.configured && health.failedLast7Days > 0 && ` ${health.failedLast7Days} email(s) were not sent in the last 7 days.`}
        </p>
        {failed === null ? (
          health.failedLast7Days > 0 && (
            <Button size="sm" variant="outline" onClick={showFailed}>
              Show failed emails
            </Button>
          )
        ) : failed.length === 0 ? (
          <p>No failed emails left.</p>
        ) : (
          <ul className="space-y-2">
            {failed.map((e) => (
              <li key={e._id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  <strong>{e.subject}</strong> → {e.to.join(", ")}
                  <span className="block text-xs opacity-80">
                    {new Date(e.createdAt).toLocaleString()} · {e.error ?? "unknown error"}
                  </span>
                </span>
                <Button size="sm" variant="outline" onClick={() => retry(e._id)} disabled={!health.configured}>
                  Retry
                </Button>
              </li>
            ))}
          </ul>
        )}
        {loadError && <p>{loadError}</p>}
      </AlertDescription>
    </Alert>
  );
}
