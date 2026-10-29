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

const newPassword = z.string().min(12, "Password must be at least 12 characters").max(128, "Password too long");

// POST /auth/password — signed-in admin changes their own password
export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required").max(200),
  newPassword,
});

// POST /auth/forgot
export const ForgotPasswordSchema = z.object({ email });

// POST /auth/reset/:token
export const ResetPasswordSchema = z.object({ password: newPassword });

// POST /admin/users — create admin user
export const AdminUserCreateSchema = z.object({
  email,
  name,
  role: z.enum(["admin", "viewer"]),
  password: newPassword,
});

// PATCH /admin/users/:id
export const AdminUserUpdateSchema = z.object({
  name: name.optional(),
  role: z.enum(["admin", "viewer"]).optional(),
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
  // Money is integer cents (lib/money.ts)
  totalAmount: z.number().int("totalAmount must be whole cents").min(100, "Total must be at least $1.00"),
  currency: z.enum(["usd"]).optional().default("usd"),
  expiresInDays: z.number().int().min(1).max(90).optional().default(14),
  milestones: z.array(z.object({
    title: shortStr("Milestone title"),
    description: optStr,
    amount: z.number().int("Milestone amount must be whole cents").min(100, "Milestone amount must be at least $1.00 (in cents)"),
    dueWeek: z.number().min(0).optional().default(0),
  })).min(1, "At least one milestone is required").max(20, "At most 20 milestones"),
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
}).superRefine((p, ctx) => {
  const sum = p.milestones.reduce((total, m) => total + m.amount, 0);
  if (sum !== p.totalAmount) {
    ctx.addIssue({ code: "custom", path: ["milestones"], message: `Milestones add up to ${sum} cents but totalAmount is ${p.totalAmount}` });
  }

});

// POST /contact/reply — recipient comes from the stored message, never the request
export const ContactReplySchema = z.object({
  messageId: z.string().regex(/^[a-f\d]{24}$/i, "messageId is required"),
  subject:   z.string().trim().min(1, "Subject is required").max(200, "Subject too long"),
  body:      z.string().trim().min(1, "Message is required").max(20000, "Message too long"),
});

// POST /payments/admin/create-invoice
export const InvoiceCreateSchema = z.object({
  taskRequestId: z.string().regex(/^[a-f\d]{24}$/i, "taskRequestId is required"),
  clientEmail: email.optional(),
  clientName: optStr,
  // Integer cents (lib/money.ts): $1.00 – $999,999.00
  amountCents: z.number().int("Amount must be whole cents").min(100, "Amount must be at least $1.00").max(99_999_900, "Amount must be at most $999,999.00"),
  currency: z.enum(["usd"]).optional().default("usd"),
  expiresInDays: z.number().int().min(1).max(90).optional().default(14),
  description: shortStr("Description"),
});
