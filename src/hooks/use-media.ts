import { useEffect, useState } from "react";
import { apiRequest, ENDPOINTS } from "@/lib/api";

// Static asset imports as fallbacks
import heroBanner from "@/assets/hero-banner.png";
import suntrixLogo from "@/assets/suntrix-logo.png";
import ceoPortrait from "@/assets/ceo-portrait.png";
import aboutHero from "@/assets/about-hero.png";
import servicesHero from "@/assets/services-hero.png";
import workflowHero from "@/assets/workflow-hero.png";
import workflowPipeline from "@/assets/workflow-pipeline.png";
import videoDemoThumb from "@/assets/video-demo-thumb.png";
import deptAgents from "@/assets/dept-agents.png";
import deptIntelligence from "@/assets/dept-intelligence.png";
import deptVision from "@/assets/dept-vision.png";
import deptPlatform from "@/assets/dept-platform.png";
import portfolioAgents from "@/assets/portfolio-agents.png";
import portfolioMl from "@/assets/portfolio-ml.png";
import portfolioVision from "@/assets/portfolio-vision.png";
import portfolioSaas from "@/assets/portfolio-saas.png";
import portfolioSupport from "@/assets/portfolio-support.png";
import portfolioSurveillance from "@/assets/portfolio-surveillance.png";

const FALLBACKS: Record<string, string> = {
  "hero-banner": heroBanner,
  "suntrix-logo": suntrixLogo,
  "ceo-portrait": ceoPortrait,
  "about-hero": aboutHero,
  "services-hero": servicesHero,
  "workflow-hero": workflowHero,
  "workflow-pipeline": workflowPipeline,
  "video-demo-thumb": videoDemoThumb,
  "agency-intro-video": videoDemoThumb,
  "dept-agents": deptAgents,
  "dept-intelligence": deptIntelligence,
  "dept-vision": deptVision,
  "dept-platform": deptPlatform,
  "portfolio-agents": portfolioAgents,
  "portfolio-ml": portfolioMl,
  "portfolio-vision": portfolioVision,
  "portfolio-saas": portfolioSaas,
  "portfolio-support": portfolioSupport,
  "portfolio-surveillance": portfolioSurveillance,
};

/** Image slots the admin can point at an uploaded file (must match MEDIA_SLOTS in the backend). */
export const MEDIA_SLOTS = Object.keys(FALLBACKS);

// One shared copy of the registry for the whole page, refreshed at most every 2 minutes
const TTL_MS = 2 * 60 * 1000;
let entries: Record<string, string> = {};
let fetchedAt = 0;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function refresh(): void {
  if (inflight || Date.now() - fetchedAt < TTL_MS) return;
  inflight = apiRequest<{ entries?: Record<string, string> }>(ENDPOINTS.CMS_MEDIA_REGISTRY)
    .then(({ data }) => {
      if (data?.entries && typeof data.entries === "object") entries = data.entries;
      fetchedAt = Date.now();
      listeners.forEach((l) => l());
    })
    .catch(() => undefined)
    .finally(() => {
      inflight = null;
    });
}

/** After an admin change, make every useMedia on the page re-read the registry. */
export function setMediaRegistry(next: Record<string, string>): void {
  entries = next;
  fetchedAt = Date.now();
  listeners.forEach((l) => l());
}

/** Test hook. */
export function resetMediaRegistry(): void {
  entries = {};
  fetchedAt = 0;
  inflight = null;
}

/** URL for an image slot: the admin's choice from the media registry, else the bundled image. */
export function useMedia(key: string): string {
  const resolve = () => entries[key] || FALLBACKS[key] || "";
  const [url, setUrl] = useState(resolve);

  useEffect(() => {
    const update = () => setUrl(entries[key] || FALLBACKS[key] || "");
    listeners.add(update);
    update();
    refresh();
    return () => {
      listeners.delete(update);
    };
  }, [key]);

  return url;
}

export function getMediaFallback(key: string): string {
  return FALLBACKS[key] || "";
}
