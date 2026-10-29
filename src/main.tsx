import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "@sentry/react";
import App from "./App.tsx";
import { AppErrorFallback } from "./components/AppErrorFallback";
import { initMonitoring } from "./lib/monitoring";
import "./index.css";

initMonitoring();

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary fallback={<AppErrorFallback />}>
    <App />
  </ErrorBoundary>,
);
