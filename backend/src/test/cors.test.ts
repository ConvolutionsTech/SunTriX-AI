import { describe, it, expect, afterEach, vi } from "vitest";
import request from "supertest";
import app from "../app";
import { allowedOrigins } from "../lib/cors";
import { EnvSchema } from "../config/env";

describe("CORS allowlist (T-BR-10)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("in production only FRONTEND_URL and CORS_ORIGINS are allowed — never localhost", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FRONTEND_URL", "https://suntrix.ai/");
    vi.stubEnv("CORS_ORIGINS", "https://staging.suntrix.ai, https://admin.suntrix.ai");
    expect(allowedOrigins()).toEqual(["https://suntrix.ai", "https://staging.suntrix.ai", "https://admin.suntrix.ai"]);

    const local = await request(app).get("/health").set("Origin", "http://localhost:5173");
    expect(local.status).toBe(403);
    expect(local.headers["access-control-allow-origin"]).toBeUndefined();

    const site = await request(app).get("/health").set("Origin", "https://staging.suntrix.ai");
    expect(site.status).toBe(200);
    expect(site.headers["access-control-allow-origin"]).toBe("https://staging.suntrix.ai");
  });

  it("local dev servers are allowed outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    for (const origin of ["http://localhost:8080", "http://localhost:5173"]) {
      expect((await request(app).get("/health").set("Origin", origin)).headers["access-control-allow-origin"]).toBe(origin);
    }
  });

  it("requests without an Origin (server-to-server, Stripe) are not affected", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await request(app).get("/health")).status).toBe(200);
  });

  it("rejects a malformed CORS_ORIGINS at startup", () => {
    const base = { MONGODB_URI: "mongodb://x/y", JWT_SECRET: "a".repeat(32), JWT_REFRESH_SECRET: "b".repeat(32), FRONTEND_URL: "https://suntrix.ai" };
    expect(EnvSchema.safeParse({ ...base, CORS_ORIGINS: "https://ok.example.com,not a url" }).success).toBe(false);
    expect(EnvSchema.safeParse({ ...base, CORS_ORIGINS: "https://ok.example.com, https://two.example.com" }).success).toBe(true);
  });
});
