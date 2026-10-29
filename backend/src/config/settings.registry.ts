import { z } from "zod";

/**
 * Every setting an admin may change at runtime (Admin → Settings).
 *
 * Secrets and deployment parameters are NOT here — they are env-only
 * (see isEnvOnlySetting in lib/configLoader.ts). An empty value means "use the
 * built-in default", so `default: ""` keeps the fallback each caller passes
 * to getSetting().
 */
export type SettingType = "text" | "toggle" | "number" | "textarea" | "url" | "select";
export type SettingSection = "ai" | "chatbot" | "email" | "storage" | "brand" | "newsletter" | "security";

export interface SettingDef {
  key: string;
  section: SettingSection;
  label: string;
  description?: string;
  type: SettingType;
  default: string;
  schema: z.ZodType<string>;
  options?: string[];
}

const blankOr = (schema: z.ZodType<string>) => z.union([z.literal(""), schema]);
const toggle = z.enum(["true", "false"], { error: "Must be true or false" });
const text = (max = 200) => z.string().max(max, `At most ${max} characters`);
const url = blankOr(z.string().url("Must be a URL"));
const email = blankOr(z.string().email("Must be an email address"));
const senderAddress = text(200);
const intIn = (min: number, max: number) =>
  blankOr(
    z.string().regex(/^\d+$/, "Must be a whole number").refine((v) => +v >= min && +v <= max, `Must be between ${min} and ${max}`)
  );
const decimalIn = (min: number, max: number) =>
  blankOr(
    z.string().regex(/^\d+(\.\d+)?$/, "Must be a number").refine((v) => +v >= min && +v <= max, `Must be between ${min} and ${max}`)
  );
const modelId = text(100).regex(/^[\w./:-]+$/, "Invalid model id");

export const SETTINGS_REGISTRY: SettingDef[] = [
  // ─── AI ─────────────────────────────────────────────────────────
  { key: "AI_ENABLED", section: "ai", label: "Enable AI features", description: "Master switch for the chatbot and AI drafting", type: "toggle", default: "true", schema: toggle },
  { key: "GROQ_CHAT_MODEL", section: "ai", label: "Chat & Generation AI Model", description: "Groq model used for AI Chatbot, Proposals, Contracts & Email Templates", type: "select", options: [], default: "llama-3.1-8b-instant", schema: modelId },
  { key: "GROQ_EXTRACT_MODEL", section: "ai", label: "Extraction AI Model", description: "Groq model used for fast structured JSON field extraction", type: "select", options: [], default: "llama-3.1-8b-instant", schema: modelId },
  { key: "GROQ_CHAT_TEMPERATURE", section: "ai", label: "Chat Temperature", description: "Creativity index (0.0 to 1.0)", type: "number", default: "0.7", schema: decimalIn(0, 2) },
  { key: "GROQ_CHAT_MAX_TOKENS", section: "ai", label: "Chat Max Tokens", description: "Upper bound on response length", type: "number", default: "1024", schema: intIn(1, 8192) },
  { key: "GROQ_EMAIL_TEMPERATURE", section: "ai", label: "Email/Document Temperature", description: "Blank = built-in default", type: "number", default: "", schema: decimalIn(0, 2) },
  { key: "GROQ_EMAIL_MAX_TOKENS", section: "ai", label: "Email/Document Max Tokens", description: "Blank = built-in default", type: "number", default: "", schema: intIn(1, 8192) },

  // ─── Chatbot ────────────────────────────────────────────────────
  { key: "CHATBOT_ENABLED", section: "chatbot", label: "Enable Website Chatbot", type: "toggle", default: "true", schema: toggle },
  { key: "CHATBOT_NAME", section: "chatbot", label: "Chatbot Name", type: "text", default: "SunTriX AI Assistant", schema: text(80) },
  { key: "CHATBOT_WELCOME_MESSAGE", section: "chatbot", label: "Welcome Message", type: "text", default: "Hello! How can SunTriX help build or scale your AI solutions today?", schema: text(500) },
  { key: "CHATBOT_SYSTEM_PROMPT", section: "chatbot", label: "Custom System Prompt", type: "textarea", default: "You are SunTriX AI Assistant, an elite software engineering and AI solutions consultant.", schema: text(5000) },
  { key: "CHATBOT_MAX_WORDS", section: "chatbot", label: "Max Response Length (Words)", type: "number", default: "150", schema: intIn(10, 2000) },
  { key: "CHATBOT_CONTACT_LINK", section: "chatbot", label: "Contact Link", description: "Blank = built-in default", type: "url", default: "", schema: url },
  { key: "CHATBOT_PORTFOLIO_LINK", section: "chatbot", label: "Portfolio Link", description: "Blank = built-in default", type: "url", default: "", schema: url },
  { key: "CHATBOT_PRICING_LINK", section: "chatbot", label: "Pricing Link", description: "Blank = built-in default", type: "url", default: "", schema: url },

  // ─── Email ──────────────────────────────────────────────────────
  { key: "EMAIL_FROM", section: "email", label: "From (full header)", description: 'e.g. "SunTriX <hello@yourdomain.com>". Blank = built from name + address', type: "text", default: "", schema: senderAddress },
  { key: "FROM_EMAIL_NAME", section: "email", label: "Sender Name", type: "text", default: "", schema: text(80) },
  { key: "FROM_EMAIL_ADDRESS", section: "email", label: "Sender Address", description: "Must be on a domain verified in Resend", type: "text", default: "", schema: email },
  { key: "ADMIN_EMAIL", section: "email", label: "Admin Email", description: "Receives admin notifications", type: "text", default: "", schema: email },
  { key: "ADMIN_NOTIFICATION_EMAIL", section: "email", label: "Notification Email Override", description: "Blank = Admin Email", type: "text", default: "", schema: email },
  { key: "EMAIL_CONTACT_NOTIFICATIONS", section: "email", label: "Notify on contact messages", type: "toggle", default: "true", schema: toggle },
  { key: "EMAIL_TASK_NOTIFICATIONS", section: "email", label: "Notify on project requests", type: "toggle", default: "true", schema: toggle },
  { key: "EMAIL_KICKOFF_SLA", section: "email", label: "Kickoff SLA text", description: "Shown in payment confirmation emails", type: "text", default: "", schema: text(120) },
  { key: "EMAIL_PAYMENT_SLA", section: "email", label: "Payment SLA text", type: "text", default: "", schema: text(120) },

  // ─── Storage ────────────────────────────────────────────────────
  { key: "UPLOAD_DEFAULT_FOLDER", section: "storage", label: "Default Upload Folder", type: "text", default: "", schema: blankOr(text(100).regex(/^[\w/-]+$/, "Letters, numbers, - _ / only")) },
  { key: "UPLOAD_MAX_SIZE_MB", section: "storage", label: "Max Upload Size (MB)", type: "number", default: "", schema: intIn(1, 100) },

  // ─── Brand ──────────────────────────────────────────────────────
  { key: "BRAND_NAME", section: "brand", label: "Brand Name", type: "text", default: "", schema: text(80) },
  { key: "BRAND_EMAIL", section: "brand", label: "Brand Email", type: "text", default: "", schema: email },
  { key: "BRAND_WEBSITE", section: "brand", label: "Website", type: "url", default: "", schema: url },
  { key: "BRAND_TAGLINE", section: "brand", label: "Tagline", type: "text", default: "", schema: text(200) },
  { key: "BRAND_RESPONSE_TIME", section: "brand", label: "Response Time Promise", type: "text", default: "", schema: text(80) },
  { key: "BRAND_PROPOSAL_GUARANTEE", section: "brand", label: "Proposal Guarantee", type: "text", default: "", schema: text(120) },

  // ─── Newsletter ─────────────────────────────────────────────────
  { key: "NEWSLETTER_DOUBLE_OPTIN", section: "newsletter", label: "Require Double Opt-in", type: "toggle", default: "false", schema: toggle },
  { key: "NEWSLETTER_BATCH_SIZE", section: "newsletter", label: "Send Batch Size", type: "number", default: "", schema: intIn(1, 100) },
  { key: "NEWSLETTER_FOOTER_TEXT", section: "newsletter", label: "Footer Text", type: "textarea", default: "", schema: text(1000) },

  // ─── Security & operations ──────────────────────────────────────
  { key: "MAINTENANCE_MODE", section: "security", label: "Maintenance Mode", description: "Public site returns 503; admin and client links keep working", type: "toggle", default: "false", schema: toggle },
  { key: "RATE_LIMIT_MAX", section: "security", label: "Requests per 15 min per IP", type: "number", default: "", schema: intIn(50, 100000) },
  { key: "RATE_LIMIT_CONTACT", section: "security", label: "Form submissions per hour per IP", type: "number", default: "", schema: intIn(1, 1000) },
  { key: "RATE_LIMIT_CHAT", section: "security", label: "Chat messages per minute per IP", type: "number", default: "", schema: intIn(1, 1000) },
  { key: "AUDIT_LOG_RETENTION_DAYS", section: "security", label: "Audit Log Retention (days)", type: "number", default: "", schema: intIn(7, 3650) },
];

export const SETTINGS_BY_KEY = new Map(SETTINGS_REGISTRY.map((d) => [d.key, d]));
