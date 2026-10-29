import { Request, Response, NextFunction } from "express";
import { z, ZodSchema } from "zod";

// ─── Zod Middleware Factory ────────────────────────────────────────────────
// Usage: router.post("/path", validate(MySchema), async (req, res) => { ... })
// On validation failure: returns 400 with structured error list.
// On success: req.body is replaced with the parsed (coerced + trimmed) value.
export function validate<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.issues.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      }));
      res.status(400).json({
        error: "Validation failed",
        details: errors,
      });
      return;
    }
    // Replace req.body with the parsed, coerced, and trimmed value
    req.body = result.data;
    next();
  };
}

// ─── Reusable primitives ───────────────────────────────────────────────────
const email    = z.string().email("Must be a valid email address").toLowerCase().trim();
const name     = z.string().trim().min(1, "Name is required").max(120, "Name too long");
const shortStr = (label: string) => z.string().trim().min(1, `${label} is required`).max(500, `${label} too long`);
const longStr  = (label: string, max = 5000) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} must be under ${max} characters`);
const optStr   = z.string().trim().max(500).optional().default("");

// ─── PUBLIC SCHEMAS ────────────────────────────────────────────────────────

// POST /contact
export const ContactSchema = z.object({
  name:    name,
  email:   email,
  company: optStr,
  subject: z.string().trim().max(200).optional().default("Website Contact"),
  message: longStr("Message", 3000),
});

// POST /task-requests
export const TaskRequestSchema = z.object({
  name:          name,
  email:         email,
  phone:         optStr,
  company:       optStr,
  role:          optStr,
  projectTitle:  optStr,
  service:       shortStr("Service"),
  budget:        optStr,
  timeline:      optStr,
  description:   longStr("Description", 5000),
  priority:      z.enum(["Low", "Medium", "High"]).optional().default("Medium"),
  techStack:     optStr,
  existingCode:  z.enum(["Yes", "No"]).optional().default("No"),
  codeDetails:   optStr,
  integrations:  optStr,
  notes:         z.string().trim().max(2000).optional().default(""),
  selectedPlan:  optStr,
  planBudget:    z.number().min(0).optional().default(0),
});

// POST /newsletter
export const NewsletterSubscribeSchema = z.object({
  name:     name,
  email:    email,
  interest: z.string().trim().min(1, "Interest is required").max(100),
});

// POST /proposals/:token/request-changes
export const ProposalRequestChangesSchema = z.object({
  clientNote: z.string().trim().min(10, "Please describe the changes in at least 10 characters").max(2000, "Note too long"),
});

// POST /contracts/:token/sign
export const ContractSignSchema = z.object({
  clientSignatureName: z.string().trim().min(2, "Please type your full name").max(120, "Name too long"),
  agreed: z.literal(true, { error: "You must agree to the contract terms" }),
});

// POST /tracker/client/:token/chat (and admin chat)
export const ChatMessageSchema = z.object({
  text: z.string().trim().min(1, "Message cannot be empty").max(5000, "Message too long (max 5000 characters)"),
});

// POST /tracker/client/:token/update
export const TrackerUpdateSchema = z.object({
  title:   shortStr("Title"),
  content: longStr("Content", 3000),
});

// ─── ADMIN SCHEMAS ─────────────────────────────────────────────────────────

// POST /newsletter/broadcast
export const NewsletterBroadcastSchema = z.object({
  subject:        shortStr("Subject"),
  body:           longStr("Body", 100000), // allow long newsletter HTML
  targetAudience: z.string().trim().optional().default("All"),
});

// POST /auth/login
export const LoginSchema = z.object({
  email:    email,
  password: z.string().min(1, "Password is required").max(200),
});

// POST /auth/refresh
export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

// POST /proposals/admin/ai-draft
export const ProposalGenerateSchema = z.object({
  taskRequestId: z.string().min(1, "taskRequestId is required"),
});

// POST /proposals/admin/create
export const ProposalCreateSchema = z.object({
  taskRequestId: z.string().min(1, "taskRequestId is required"),
  title: shortStr("Title"),
  introduction: optStr,
  scopeItems: z.array(z.string()).optional().default([]),
  timeline: optStr,
  milestones: z.array(z.object({
    title: shortStr("Milestone title"),
    description: optStr,
    amount: z.number().min(1, "Milestone amount must be at least $1"),
    dueWeek: z.number().min(0).optional().default(0),
  })).min(1, "At least one milestone is required"),
  terms: optStr,
  executiveSummary: optStr,
  scopeOfWork: optStr,
  deliverables: optStr,
  pricingBreakdown: optStr,
  revisionsPolicy: optStr,
  clientResponsibilities: optStr,
  supportAndWarranty: optStr,
  paymentTerms: optStr,
  nextSteps: optStr,
  clientEmail: email,
  clientName: optStr,
  aiDrafted: z.boolean().optional().default(false),
});

// POST /contact/reply — recipient comes from the stored message, never the request
export const ContactReplySchema = z.object({
  messageId: z.string().regex(/^[a-f\d]{24}$/i, "messageId is required"),
  subject:   z.string().trim().min(1, "Subject is required").max(200, "Subject too long"),
  body:      z.string().trim().min(1, "Message is required").max(20000, "Message too long"),
});

// POST /payments/admin/create-invoice
export const InvoiceCreateSchema = z.object({
  taskRequestId: z.string().optional().nullable(),
  clientEmail: email,
  clientName: optStr,
  amountUSD: z.number().min(1, "Amount must be between $1 and $999,999").max(999999, "Amount must be between $1 and $999,999"),
  description: shortStr("Description"),
});
