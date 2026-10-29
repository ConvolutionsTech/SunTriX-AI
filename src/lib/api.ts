/**
 * The single source of backend endpoints (ENDPOINTS) and the apiRequest()
 * helper, which returns { data, error, status } instead of throwing.
 *
 * - BASE_URL comes from VITE_API_URL (defaults to the local API).
 * - The admin session token is attached only on /admin pages or with { auth: true }
 *   (the API treats any Bearer header as "show drafts"); AuthManager owns the session.
 * - AI features (chat, drafting) go through the backend, which calls Groq.
 */

// Backend URL — reads from VITE_API_URL env var in production, falls back to local dev
const BASE_URL = (import.meta.env.VITE_API_URL as string) || "http://localhost:4000/v1";

// Cloudinary config (update when ready)
const CLOUDINARY_URL = "";

// ─── Grok AI Configuration ─────────────────────────────────────
// Grok uses an OpenAI-compatible API format (https://api.x.ai/v1)
// The backend should proxy chat requests to Grok to keep the API key server-side.
//
// Models available:
//   - grok-3        (most capable, paid)
//   - grok-3-mini   (free tier, good for most use cases)
//
// Required env vars on backend:
//   GROK_API_KEY=xai-xxxxxxxxxxxxxxxxxxxxxxxx
//
// Backend proxy pattern (Node.js/Express):
//   app.post("/chat", async (req, res) => {
//     const { messages } = req.body;
//     const response = await fetch("https://api.x.ai/v1/chat/completions", {
//       method: "POST",
//       headers: {
//         "Authorization": `Bearer ${process.env.GROK_API_KEY}`,
//         "Content-Type": "application/json",
//       },
//       body: JSON.stringify({
//         model: "grok-3-mini",  // or "grok-3"
//         messages: [
//           { role: "system", content: "You are SunTriX AI assistant..." },
//           ...messages,
//         ],
//         temperature: 0.7,
//         max_tokens: 1024,
//       }),
//     });
//     const data = await response.json();
//     res.json(data);
//   });
//
// Request format (OpenAI-compatible):
//   POST /chat/completions
//   {
//     "model": "grok-3-mini",
//     "messages": [
//       { "role": "system", "content": "..." },
//       { "role": "user", "content": "..." }
//     ],
//     "temperature": 0.7,
//     "max_tokens": 1024,
//     "stream": false
//   }
//
// Response format:
//   {
//     "choices": [{ "message": { "role": "assistant", "content": "..." } }],
//     "usage": { "prompt_tokens": 10, "completion_tokens": 50, "total_tokens": 60 }
//   }

const GROK_API_URL = "https://api.x.ai/v1";

// ─── Endpoint Definitions ─────────────────────────────────────────
export const ENDPOINTS = {
  // Auth
  AUTH_LOGIN: `${BASE_URL}/auth/login`,
  AUTH_LOGOUT: `${BASE_URL}/auth/logout`,
  AUTH_REFRESH: `${BASE_URL}/auth/refresh`,
  AUTH_PASSWORD: `${BASE_URL}/auth/password`,
  AUTH_FORGOT: `${BASE_URL}/auth/forgot`,
  AUTH_RESET: (token: string) => `${BASE_URL}/auth/reset/${token}`,

  // Contact & Requests
  CONTACT_SUBMIT: `${BASE_URL}/contact`,
  CONTACT_REPLY: `${BASE_URL}/contact/reply`,
  TASK_REQUEST_SUBMIT: `${BASE_URL}/task-requests`,
  TASK_REQUEST_LIST: `${BASE_URL}/task-requests`,
  TASK_REQUEST_BY_ID: (id: string) => `${BASE_URL}/task-requests/${id}`,
  TASK_REQUEST_UPDATE_STATUS: (id: string) => `${BASE_URL}/task-requests/${id}/status`,
  TASK_REQUEST_TRACK: (token: string) => `${BASE_URL}/task-requests/track/${token}`,

  // AI Chatbot (proxied through backend → Grok API)
  // Backend forwards to: https://api.x.ai/v1/chat/completions
  CHAT_SEND: `${BASE_URL}/chat`,

  // Portfolio & Case Studies
  PORTFOLIO_LIST: `${BASE_URL}/portfolio`,
  PORTFOLIO_BY_SLUG: (slug: string) => `${BASE_URL}/portfolio/slug/${slug}`,
  PORTFOLIO_CREATE: `${BASE_URL}/portfolio`,
  PORTFOLIO_UPDATE: (id: string) => `${BASE_URL}/portfolio/${id}`,
  PORTFOLIO_DELETE: (id: string) => `${BASE_URL}/portfolio/${id}`,
  PORTFOLIO_REORDER: `${BASE_URL}/portfolio/reorder`,


  // Testimonials
  TESTIMONIALS_LIST: `${BASE_URL}/testimonials`,
  TESTIMONIALS_UPDATE: (id: string) => `${BASE_URL}/testimonials/${id}`,
  TESTIMONIALS_DELETE: (id: string) => `${BASE_URL}/testimonials/${id}`,

  // Newsletter
  NEWSLETTER_SUBSCRIBE: `${BASE_URL}/newsletter`,
  NEWSLETTER_CONFIRM: (token: string) => `${BASE_URL}/newsletter/confirm/${token}`,
  NEWSLETTER_UNSUBSCRIBE: (token: string) => `${BASE_URL}/newsletter/unsubscribe/${token}`,
  NEWSLETTER_LIST: `${BASE_URL}/newsletter`,
  NEWSLETTER_BROADCAST: `${BASE_URL}/newsletter/broadcast`,

  // CMS Content
  CMS_ANNOUNCEMENT: `${BASE_URL}/cms/announcement`,
  CMS_HERO: `${BASE_URL}/cms/hero`,
  CMS_COMPANY: `${BASE_URL}/cms/company`,
  CMS_SOCIAL_LINKS: `${BASE_URL}/cms/social-links`,
  CMS_MEDIA_REGISTRY: `${BASE_URL}/cms/media-registry`,

  // Departments
  DEPARTMENTS_LIST: `${BASE_URL}/departments`,
  DEPARTMENTS_CREATE: `${BASE_URL}/departments`,
  DEPARTMENTS_UPDATE: (id: string) => `${BASE_URL}/departments/${id}`,
  DEPARTMENTS_DELETE: (id: string) => `${BASE_URL}/departments/${id}`,
  DEPARTMENTS_REORDER: `${BASE_URL}/departments/reorder`,

  // Admin
  ADMIN_DASHBOARD_STATS: `${BASE_URL}/admin/stats`,
  ADMIN_ACTIVITY: (days = 30) => `${BASE_URL}/admin/activity?days=${days}`,
  ADMIN_NOTIFICATIONS: `${BASE_URL}/admin/notifications`,
  ADMIN_AI_USAGE: (days = 7) => `${BASE_URL}/admin/ai-usage?days=${days}`,
  ADMIN_EMAIL_LOG: (status?: string) => `${BASE_URL}/admin/email-log${status ? `?status=${status}` : ""}`,
  ADMIN_EMAIL_RETRY: (id: string) => `${BASE_URL}/admin/email-log/${id}/retry`,
  ADMIN_CONTACTS: `${BASE_URL}/contact`,
  ADMIN_USERS: `${BASE_URL}/admin/users`,
  ADMIN_USER: (id: string) => `${BASE_URL}/admin/users/${id}`,

  // Team
  TEAM_LIST: `${BASE_URL}/team`,
  TEAM_CREATE: `${BASE_URL}/team`,
  TEAM_UPDATE: (id: string) => `${BASE_URL}/team/${id}`,
  TEAM_DELETE: (id: string) => `${BASE_URL}/team/${id}`,
  TEAM_REORDER: `${BASE_URL}/team/reorder`,

  // Clients (Logo Wall)
  CLIENTS_LIST: `${BASE_URL}/clients`,
  CLIENTS_CREATE: `${BASE_URL}/clients`,
  CLIENTS_UPDATE: (id: string) => `${BASE_URL}/clients/${id}`,
  CLIENTS_DELETE: (id: string) => `${BASE_URL}/clients/${id}`,
  CLIENTS_REORDER: `${BASE_URL}/clients/reorder`,

  // Pricing
  PRICING_LIST: `${BASE_URL}/pricing`,
  PRICING_CREATE: `${BASE_URL}/pricing`,
  PRICING_UPDATE: (id: string) => `${BASE_URL}/pricing/${id}`,
  PRICING_DELETE: (id: string) => `${BASE_URL}/pricing/${id}`,
  PRICING_REORDER: `${BASE_URL}/pricing/reorder`,

  // Blog / Posts
  BLOG_LIST: `${BASE_URL}/posts`,
  BLOG_BY_SLUG: (slug: string) => `${BASE_URL}/posts/slug/${slug}`,
  BLOG_BY_ID: (id: string) => `${BASE_URL}/posts/${id}`,
  BLOG_CREATE: `${BASE_URL}/posts`,
  BLOG_UPDATE: (id: string) => `${BASE_URL}/posts/${id}`,
  BLOG_DELETE: (id: string) => `${BASE_URL}/posts/${id}`,
  BLOG_BULK_DELETE: `${BASE_URL}/posts/bulk`,

  // Audit Log
  AUDIT_LIST: `${BASE_URL}/audit`,

  // AI-Assisted Field Extraction
  AI_EXTRACT: `${BASE_URL}/ai/extract`,

  // Campaigns
  CAMPAIGN_LIST: `${BASE_URL}/newsletter/campaigns`,
  CAMPAIGN_RETRY: (id: string) => `${BASE_URL}/newsletter/admin/campaigns/${id}/retry`,

  // Assets (Cloudinary via backend)
  UPLOAD_IMAGE: `${BASE_URL}/upload/image`,
  UPLOAD_VIDEO: `${BASE_URL}/upload/video`,
  UPLOAD_DOCUMENT: `${BASE_URL}/upload/document`,
  UPLOAD_LIST: `${BASE_URL}/upload`,
  UPLOAD_DELETE: (assetId: string) => `${BASE_URL}/upload/${encodeURIComponent(assetId)}`,

  // Payments (Stripe)
  PAYMENT_INVOICE_CHECKOUT: (token: string) => `${BASE_URL}/payments/invoice/${token}/checkout`,
  PAYMENT_INVOICE: (token: string) => `${BASE_URL}/payments/invoice/${token}`,
  PAYMENT_ADMIN_LIST: `${BASE_URL}/payments/admin/list`,
  PAYMENT_ADMIN_STATS: `${BASE_URL}/payments/admin/stats`,
  PAYMENT_ADMIN_CREATE_INVOICE: `${BASE_URL}/payments/admin/invoice`,
  PAYMENT_ADMIN_REFUND: (id: string) => `${BASE_URL}/payments/admin/refund/${id}`,

  // Proposals
  PROPOSAL_ADMIN_AI_DRAFT:   `${BASE_URL}/proposals/admin/ai-draft`,
  PROPOSAL_ADMIN_CREATE:     `${BASE_URL}/proposals`,
  PROPOSAL_ADMIN_BY_TASK: (taskId: string) => `${BASE_URL}/proposals/admin/by-task/${taskId}`,
  PROPOSAL_ADMIN_SEND: (id: string) => `${BASE_URL}/proposals/${id}/send`,
  PROPOSAL_BY_TOKEN:      (token: string)  => `${BASE_URL}/proposals/view/${token}`,
  PROPOSAL_ACCEPT:        (token: string)  => `${BASE_URL}/proposals/accept/${token}`,
  PROPOSAL_REQUEST_CHANGES: (token: string) => `${BASE_URL}/proposals/request-changes/${token}`,

  // Contracts
  CONTRACT_BY_TOKEN:   (token: string) => `${BASE_URL}/contracts/${token}`,
  CONTRACT_SIGN:       (token: string) => `${BASE_URL}/contracts/${token}/sign`,
  CONTRACT_ADMIN_BY_TASK: (taskId: string) => `${BASE_URL}/contracts/admin/by-task/${taskId}`,

  // System Settings (Admin)
  SETTINGS_LIST:  `${BASE_URL}/settings`,
  SETTINGS_BULK:  `${BASE_URL}/settings/bulk`,
  SETTINGS_PUBLIC: `${BASE_URL}/settings/public`,
  SETTINGS_AI_MODELS: (refresh = false) => `${BASE_URL}/settings/ai/models${refresh ? "?refresh=true" : ""}`,

  // Project Tracker
  TRACKER_ADMIN_LIST:  `${BASE_URL}/tracker/admin/list`,
  TRACKER_ADMIN_FOR_TASK: (taskId: string) => `${BASE_URL}/tracker/admin/list?taskRequestId=${taskId}`,
  TRACKER_ADMIN_BY_ID: (id: string) => `${BASE_URL}/tracker/admin/${id}`,
  TRACKER_ADMIN_AUDIT: (id: string) => `${BASE_URL}/tracker/admin/${id}/audit`,
  TRACKER_ADMIN_PHASE_ADVANCE:      (id: string) => `${BASE_URL}/tracker/admin/${id}/phase/advance`,
  TRACKER_ADMIN_DELIVERABLE_DONE:   (id: string, dId: string) => `${BASE_URL}/tracker/admin/${id}/deliverable/${dId}/complete`,
  TRACKER_ADMIN_UPDATE:             (id: string) => `${BASE_URL}/tracker/admin/${id}/update`,
  TRACKER_ADMIN_CHAT:               (id: string) => `${BASE_URL}/tracker/admin/${id}/chat`,
  TRACKER_ADMIN_FILE_UPLOAD:        (id: string) => `${BASE_URL}/tracker/admin/${id}/file/upload`,
  TRACKER_ADMIN_MILESTONE_PAYABLE:  (id: string, mId: string) => `${BASE_URL}/tracker/admin/${id}/milestone/${mId}/mark-payable`,
  TRACKER_ADMIN_MILESTONE_PAID_MANUALLY: (id: string, mId: string) => `${BASE_URL}/tracker/admin/${id}/milestone/${mId}/mark-paid-manually`,
  TRACKER_CLIENT_BY_TOKEN:          (token: string) => `${BASE_URL}/tracker/client/${token}`,
  TRACKER_CLIENT_DELIVERABLE_APPROVE: (token: string, dId: string) => `${BASE_URL}/tracker/client/${token}/deliverable/${dId}/approve`,
  TRACKER_CLIENT_DELIVERABLE_REJECT:  (token: string, dId: string) => `${BASE_URL}/tracker/client/${token}/deliverable/${dId}/reject`,
  TRACKER_CLIENT_FILE_APPROVE:        (token: string, fId: string) => `${BASE_URL}/tracker/client/${token}/file/${fId}/approve`,
  TRACKER_CLIENT_FILE_REJECT:         (token: string, fId: string) => `${BASE_URL}/tracker/client/${token}/file/${fId}/reject`,
  TRACKER_CLIENT_UPDATE_ACK:          (token: string, uId: string) => `${BASE_URL}/tracker/client/${token}/update/${uId}/acknowledge`,
  TRACKER_CLIENT_CHAT:                (token: string) => `${BASE_URL}/tracker/client/${token}/chat`,
  TRACKER_CLIENT_MILESTONE_CHECKOUT:  (token: string, mId: string) => `${BASE_URL}/tracker/client/${token}/milestone/${mId}/checkout`,
  TRACKER_ADMIN_COMPLETION_REQUEST:   (id: string) => `${BASE_URL}/tracker/admin/${id}/completion/request`,
  TRACKER_CLIENT_COMPLETION_APPROVE:  (token: string) => `${BASE_URL}/tracker/client/${token}/completion/approve`,
} as const;

// ─── Grok Chat Helper Types ──────────────────────────────────────

export interface GrokChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GrokChatRequest {
  model: string;
  messages: GrokChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface GrokChatResponse {
  choices: { message: { role: string; content: string } }[];
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

// ─── HTTP Client ─────────────────────────────────────────────────
import { authManager } from "./auth";

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** JSON-serialisable value, or FormData for file uploads (sent as multipart) */
  body?: unknown;
  headers?: Record<string, string>;
  /**
   * Send the admin access token. Defaults to true on /admin pages and false
   * elsewhere: public pages must not send it, because the API treats any
   * Bearer header as "show drafts and hidden items".
   */
  auth?: boolean;
}

function onAdminPage(): boolean {
  return typeof window !== "undefined" && window.location.pathname.startsWith("/admin");
}

function redirectToLogin() {
  if (onAdminPage() && window.location.pathname !== "/admin/login") {
    window.location.href = "/admin/login";
  }
}

// Single-flight refresh: concurrent 401s share one POST /auth/refresh
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = authManager.getRefreshToken();
  if (!refreshToken) return null;

  try {
    const res = await fetch(ENDPOINTS.AUTH_REFRESH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.token || !data?.refreshToken) return null;
    authManager.setTokens(data.token, data.refreshToken);
    return data.token as string;
  } catch {
    return null;
  }
}

function getFreshToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = refreshAccessToken().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/**
 * Human-readable message from any backend error body: `{ message }`,
 * `{ error }`, or a validation failure `{ error, details: [{ field, message }] }`.
 */
export function errorMessage(body: unknown, status: number): string {
  const b = (body && typeof body === "object" ? body : {}) as {
    message?: unknown;
    error?: unknown;
    details?: Array<{ field?: string; message?: string }>;
  };
  if (Array.isArray(b.details) && b.details.length) {
    return b.details.map((d) => (d.field ? `${d.field}: ${d.message}` : d.message)).join("; ");
  }
  if (typeof b.message === "string" && b.message) return b.message;
  if (typeof b.error === "string" && b.error) return b.error;
  if (status === 429) return "Too many requests — please wait a moment and try again.";
  if (status >= 500) return "The server ran into a problem. Please try again shortly.";
  return `Request failed (${status})`;
}

export async function apiRequest<T = unknown>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<{ data: T | null; error: string | null; status: number }> {
  const { method = "GET", body, headers = {}, auth = onAdminPage() } = options;

  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const send = (token: string | null) =>
    fetch(endpoint, {
      method,
      headers: {
        // Multipart bodies set their own Content-Type (with boundary)
        ...(isForm ? {} : { "Content-Type": "application/json" }),
        ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      ...(body ? { body: isForm ? (body as FormData) : JSON.stringify(body) } : {}),
    });

  try {
    let res = await send(authManager.getToken());

    // Only authenticated calls refresh or log out; a public 401 is just an error
    if (res.status === 401 && auth && endpoint !== ENDPOINTS.AUTH_LOGIN && endpoint !== ENDPOINTS.AUTH_REFRESH) {
      const token = await getFreshToken();
      if (!token) {
        authManager.clear();
        redirectToLogin();
        return { data: null, error: "Session expired. Please log in again.", status: 401 };
      }
      res = await send(token);
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { data: null, error: errorMessage(err, res.status), status: res.status };
    }

    const data = await res.json();
    return { data, error: null, status: res.status };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : "Network error", status: 0 };
  }
}

/** Authenticated multipart upload with the same refresh and error handling as apiRequest. */
export function apiUpload<T = unknown>(endpoint: string, formData: FormData) {
  return apiRequest<T>(endpoint, { method: "POST", body: formData, auth: true });
}

/** Ends the admin session: best-effort server notification, then local clear. */
export async function logout(): Promise<void> {
  const token = authManager.getToken();
  if (token) {
    await fetch(ENDPOINTS.AUTH_LOGOUT, { method: "POST", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
  }
  authManager.clear();
}
