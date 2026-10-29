import { describe, it, expect, vi, afterEach } from "vitest";
import { validateEnv } from "../config/env";

const base = {
  NODE_ENV: "development",
  MONGODB_URI: "mongodb://127.0.0.1:27017/suntrix",
  JWT_SECRET: "a".repeat(32),
  JWT_REFRESH_SECRET: "b".repeat(32),
  FRONTEND_URL: "http://localhost:5173",
};

const production = {
  ...base,
  NODE_ENV: "production",
  STRIPE_SECRET_KEY: "sk_test_123",
  STRIPE_WEBHOOK_SECRET: "whsec_123",
  RESEND_API_KEY: "re_123",
  CLOUDINARY_CLOUD_NAME: "cloud",
  CLOUDINARY_API_KEY: "key",
  CLOUDINARY_API_SECRET: "secret",
};

afterEach(() => vi.restoreAllMocks());

describe("validateEnv", () => {
  it("accepts a minimal development environment and applies defaults", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const env = validateEnv(base);
    expect(env.PORT).toBe(4000);
    expect(env.JWT_EXPIRY).toBe("7d");
  });

  it("accepts a complete production environment", () => {
    expect(() => validateEnv(production)).not.toThrow();
  });

  it("fails when JWT_SECRET is unset, and treats an empty value as unset", () => {
    const { JWT_SECRET: _omit, ...withoutSecret } = base;
    expect(() => validateEnv(withoutSecret)).toThrow(/JWT_SECRET is required/);
    expect(() => validateEnv({ ...base, JWT_SECRET: "" })).toThrow(/JWT_SECRET is required/);
  });

  it("rejects short or reused JWT secrets", () => {
    expect(() => validateEnv({ ...base, JWT_SECRET: "too-short" })).toThrow(/at least 32/);
    expect(() => validateEnv({ ...base, JWT_REFRESH_SECRET: base.JWT_SECRET })).toThrow(/must differ/);
  });

  it("rejects a malformed JWT_EXPIRY that would break every login", () => {
    expect(() => validateEnv({ ...base, JWT_EXPIRY: "abc" })).toThrow(/JWT_EXPIRY/);
  });

  it("requires payment, email and media secrets in production", () => {
    const { STRIPE_WEBHOOK_SECRET: _omit, ...missingWebhook } = production;
    expect(() => validateEnv(missingWebhook)).toThrow(/STRIPE_WEBHOOK_SECRET is required in production/);
  });

  it("validates secret formats", () => {
    expect(() => validateEnv({ ...production, STRIPE_WEBHOOK_SECRET: "not-a-secret" })).toThrow(/whsec_/);
    expect(() => validateEnv({ ...base, MONGODB_URI: "postgres://x" })).toThrow(/MONGODB_URI/);
  });

  it("never echoes secret values in the error", () => {
    const leaky = "sk_live_should_not_appear";
    try {
      validateEnv({ ...production, STRIPE_SECRET_KEY: leaky, JWT_SECRET: "short" });
      throw new Error("expected validateEnv to throw");
    } catch (err: any) {
      expect(err.message).not.toContain("short");
      expect(err.message).not.toContain(leaky);
    }
  });
});
