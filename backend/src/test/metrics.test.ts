import { describe, it, expect, afterEach, vi } from "vitest";
import request from "supertest";
import app from "../app";
import { scrubEvent } from "../lib/sentry";

describe("metrics and error-tracking hygiene (T-OPB-10)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("/metrics is hidden unless METRICS_TOKEN is set, then requires it", async () => {
    expect((await request(app).get("/metrics")).status).toBe(404);

    vi.stubEnv("METRICS_TOKEN", "scrape-secret");
    expect((await request(app).get("/metrics")).status).toBe(401);
    expect((await request(app).get("/metrics").set("Authorization", "Bearer wrong")).status).toBe(401);

    await request(app).post("/v1/proposals/request-changes/prop_supersecret").send({});
    const res = await request(app).get("/metrics").set("Authorization", "Bearer scrape-secret");
    expect(res.status).toBe(200);
    for (const name of ["http_requests_total", "stripe_webhook_events_total", "groq_requests_total", "email_send_total"]) {
      expect(res.text).toContain(name);
    }
    // Route labels are patterns, never the token itself
    expect(res.text).toContain('route="/v1/proposals/request-changes/:token"');
    expect(res.text).not.toContain("prop_supersecret");
  });

  it("Sentry events drop bodies, headers, cookies, emails and tokens", () => {
    const event = scrubEvent({
      type: undefined,
      request: {
        url: "https://api.example.com/v1/payments/invoice/inv_secret/checkout",
        data: { email: "ada@client.test" },
        headers: { authorization: "Bearer x" },
        cookies: { a: "b" },
        query_string: "token=abc",
      },
      user: { id: "u1", email: "ada@client.test", ip_address: "1.2.3.4" },
    } as any);
    expect(event.request).toEqual({ url: "/v1/payments/invoice/:token/checkout" });
    expect(event.user).toEqual({ id: "u1" });
  });
});
