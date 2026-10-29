import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app";

describe("security and cache headers (T-OPB-15)", () => {
  it("sends HSTS, nosniff and frame denial on API responses", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["strict-transport-security"]).toBe("max-age=63072000; includeSubDomains");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toBeUndefined();
  });

  it("marks sessions and capability links no-store, but not public content", async () => {
    const login = await request(app).post("/v1/auth/login").set("X-Forwarded-For", "10.99.0.1").send({});
    expect(login.headers["cache-control"]).toBe("no-store");
    expect((await request(app).post("/v1/proposals/request-changes/prop_x").send({})).headers["cache-control"]).toBe("no-store");
    expect((await request(app).get("/health")).headers["cache-control"]).toBeUndefined();
  });
});
