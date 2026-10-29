import { Button } from "@/components/ui/button";

/** Shown instead of a blank screen when rendering crashes. */
export function AppErrorFallback() {
  return (
    <div role="alert" className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="max-w-md text-muted-foreground">The page hit an unexpected error. Reloading usually fixes it; if not, please try again in a few minutes.</p>
      <Button onClick={() => window.location.reload()}>Reload page</Button>
    </div>
  );
}
