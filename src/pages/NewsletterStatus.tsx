import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Layout from "@/components/Layout";
import { apiRequest, ENDPOINTS } from "@/lib/api";

type Phase = "idle" | "working" | "done" | "error";

/**
 * /newsletter/confirm/:token — confirms a double opt-in subscription on load.
 * /newsletter/unsubscribe/:token — unsubscribes only after a click, because mail
 * scanners open links automatically.
 */
const NewsletterStatus = ({ mode }: { mode: "confirm" | "unsubscribe" }) => {
  const { token = "" } = useParams<{ token: string }>();
  const [phase, setPhase] = useState<Phase>(mode === "confirm" ? "working" : "idle");
  const [message, setMessage] = useState("");

  const run = async () => {
    setPhase("working");
    const { data, error } =
      mode === "confirm"
        ? await apiRequest<{ message: string }>(ENDPOINTS.NEWSLETTER_CONFIRM(token))
        : await apiRequest<{ message: string }>(ENDPOINTS.NEWSLETTER_UNSUBSCRIBE(token), { method: "POST" });
    setMessage(error || data?.message || "");
    setPhase(error ? "error" : "done");
  };

  useEffect(() => {
    if (mode === "confirm") run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, token]);

  return (
    <Layout>
      <section className="container mx-auto px-4 py-24 max-w-lg text-center">
        <h1 className="text-2xl font-display font-bold text-foreground mb-4">
          {mode === "confirm" ? "Newsletter subscription" : "Unsubscribe"}
        </h1>

        {phase === "idle" && (
          <>
            <p className="text-muted-foreground mb-6">Stop receiving our newsletter at this address?</p>
            <button onClick={run} className="gradient-bg rounded-lg px-6 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90">
              Unsubscribe
            </button>
          </>
        )}
        {phase === "working" && <p className="text-muted-foreground">One moment…</p>}
        {(phase === "done" || phase === "error") && (
          <p role={phase === "error" ? "alert" : "status"} className={phase === "error" ? "text-destructive" : "text-foreground"}>
            {message}
          </p>
        )}

        <p className="mt-10 text-sm">
          <Link to="/" className="text-primary hover:underline">Back to the homepage</Link>
        </p>
      </section>
    </Layout>
  );
};

export default NewsletterStatus;
