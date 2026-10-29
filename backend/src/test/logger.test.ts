import { describe, it, expect } from "vitest";
import { Writable } from "stream";
import express from "express";
import request from "supertest";
import { createLogger, httpLogger, redactUrl } from "../lib/logger";

function capture() {
  const lines: Record<string, any>[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      for (const line of chunk.toString().split("\n").filter(Boolean)) lines.push(JSON.parse(line));
      cb();
    },
  });
  const logger = createLogger(stream);
  logger.level = "info";
  return { lines, logger };
}

function appWith(logger: ReturnType<typeof createLogger>) {
  const app = express();
  app.use(httpLogger(logger));
  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/v1/contracts/:token", (_req, res) => res.json({ ok: true }));
  app.get("/v1/boom", (_req, res) => res.status(500).json({ error: "x" }));
  return app;
}

describe("structured request logging (T-OPB-8)", () => {
  it("logs JSON with a request id and never the capability token or auth header", async () => {
    const { lines, logger } = capture();
    const res = await request(appWith(logger))
      .get("/v1/contracts/contract_secret123?token=abc")
      .set("Authorization", "Bearer very-secret-jwt");

    expect(res.headers["x-request-id"]).toBeTruthy();
    const raw = JSON.stringify(lines);
    expect(raw).not.toContain("contract_secret123");
    expect(raw).not.toContain("very-secret-jwt");
    expect(raw).not.toContain("token=abc");
    const entry = lines.find((l) => l.req)!;
    expect(entry.req.url).toBe("/v1/contracts/:token?token=[redacted]");
    expect(entry.req.id).toBe(res.headers["x-request-id"]);
    expect(entry.level).toBe(30);
    expect(entry.msg).toContain("/v1/contracts/:token");
  });

  it("reuses a sane incoming X-Request-Id and rejects a hostile one", async () => {
    const { logger } = capture();
    const app = appWith(logger);
    expect((await request(app).get("/v1/contracts/x").set("X-Request-Id", "lb-123")).headers["x-request-id"]).toBe("lb-123");
    expect((await request(app).get("/v1/contracts/x").set("X-Request-Id", "bad id <script>")).headers["x-request-id"]).not.toContain("bad");
  });

  it("logs 5xx as errors and skips health checks", async () => {
    const { lines, logger } = capture();
    const app = appWith(logger);
    await request(app).get("/health");
    await request(app).get("/v1/boom");
    expect(lines.some((l) => l.req?.url === "/health")).toBe(false);
    expect(lines.find((l) => l.req?.url === "/v1/boom")?.level).toBe(50);
  });

  it("redacts every capability-link route but leaves admin routes readable", () => {
    expect(redactUrl("/v1/proposals/view/prop_abc")).toBe("/v1/proposals/view/:token");
    expect(redactUrl("/v1/proposals/accept/prop_abc")).toBe("/v1/proposals/accept/:token");
    expect(redactUrl("/v1/contracts/contract_abc/sign")).toBe("/v1/contracts/:token/sign");
    expect(redactUrl("/v1/tracker/client/trk_abc/chat")).toBe("/v1/tracker/client/:token/chat");
    expect(redactUrl("/v1/payments/invoice/inv_abc/checkout")).toBe("/v1/payments/invoice/:token/checkout");
    expect(redactUrl("/v1/task-requests/track/tr_abc")).toBe("/v1/task-requests/track/:token");
    expect(redactUrl("/v1/newsletter/confirm/abc")).toBe("/v1/newsletter/confirm/:token");
    expect(redactUrl("/v1/auth/reset/abc")).toBe("/v1/auth/reset/:token");
    expect(redactUrl("/v1/contracts/admin/by-task/123")).toBe("/v1/contracts/admin/by-task/123");
  });
});
