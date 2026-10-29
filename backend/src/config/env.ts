import { z } from "zod";
import { logger } from "../lib/logger";

/**
 * Startup environment validation. Secrets are env-only (see isEnvOnlySetting),
 * so this is the single place that decides whether the server may boot.
 * Error messages name the variable but never echo its value.
 */
const nonEmpty = (name: string) => z.string({ error: `${name} is required` }).trim().min(1, `${name} is required`);

const PRODUCTION_REQUIRED = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
] as const;

export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    MONGODB_URI: nonEmpty("MONGODB_URI").regex(/^mongodb(\+srv)?:\/\//, "MONGODB_URI must be a mongodb:// or mongodb+srv:// URI"),
    JWT_SECRET: nonEmpty("JWT_SECRET").min(32, "JWT_SECRET must be at least 32 characters"),
    JWT_REFRESH_SECRET: nonEmpty("JWT_REFRESH_SECRET").min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
    JWT_EXPIRY: z.string().regex(/^\d+[smhdw]$/, "JWT_EXPIRY must look like 15m, 12h or 7d").default("15m"),
    FRONTEND_URL: nonEmpty("FRONTEND_URL").url("FRONTEND_URL must be a URL"),
    STRIPE_SECRET_KEY: z.string().regex(/^(sk|rk)_(live|test)_/, "STRIPE_SECRET_KEY must start with sk_live_/sk_test_").optional(),
    STRIPE_WEBHOOK_SECRET: z.string().regex(/^whsec_/, "STRIPE_WEBHOOK_SECRET must start with whsec_").optional(),
    RESEND_API_KEY: z.string().regex(/^re_/, "RESEND_API_KEY must start with re_").optional(),
    CLOUDINARY_CLOUD_NAME: z.string().min(1).optional(),
    CLOUDINARY_API_KEY: z.string().min(1).optional(),
    CLOUDINARY_API_SECRET: z.string().min(1).optional(),
    TRUST_PROXY: z.string().optional(),
    CORS_ORIGINS: z
      .string()
      .optional()
      .refine(
        (v) => !v || v.split(",").map((o) => o.trim()).filter(Boolean).every((o) => /^https?:\/\/[^/\s]+\/?$/.test(o)),
        "CORS_ORIGINS must be a comma-separated list of origins like https://admin.example.com"
      ),
  })
  .superRefine((env, ctx) => {
    if (env.JWT_SECRET && env.JWT_SECRET === env.JWT_REFRESH_SECRET) {
      ctx.addIssue({ code: "custom", path: ["JWT_REFRESH_SECRET"], message: "JWT_REFRESH_SECRET must differ from JWT_SECRET" });
    }
    if (env.NODE_ENV !== "production") return;
    for (const key of PRODUCTION_REQUIRED) {
      if (!env[key]) {
        ctx.addIssue({ code: "custom", path: [key], message: `${key} is required in production` });
      }
    }
  });

export type Env = z.infer<typeof EnvSchema>;

// Treat empty strings as unset so `KEY=` in a .env file counts as missing
function withoutEmpty(source: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v.trim() !== "")) as Record<string, string>;
}

export function validateEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(withoutEmpty(source));
  if (!result.success) {
    const problems = result.error.issues.map((i) => `  - ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }

  if (result.data.NODE_ENV === "production" && !result.data.TRUST_PROXY) {
    logger.warn("⚠️  TRUST_PROXY is not set: behind a load balancer every client shares one rate-limit bucket. Set it to the number of proxies in front of the app.");
  }

  if (result.data.NODE_ENV !== "production") {
    const missing = PRODUCTION_REQUIRED.filter((k) => !result.data[k]);
    if (missing.length) logger.warn(`⚠️  Not configured (required in production): ${missing.join(", ")}`);
  }
  return result.data;
}
