import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { parseTrustProxy } from "../lib/trustProxy";

function appWith(trust: string | undefined) {
  const app = express();
  app.set("trust proxy", parseTrustProxy(trust));
  app.get("/ip", (req, res) => res.json({ ip: req.ip }));
  return app;
}

describe("trust proxy (M26)", () => {
  it("ignores a client-supplied X-Forwarded-For by default", async () => {
    const res = await request(appWith(undefined)).get("/ip").set("X-Forwarded-For", "1.2.3.4");
    expect(res.body.ip).not.toBe("1.2.3.4");
  });

  it("uses the address added by one trusted proxy, not the client-supplied first entry", async () => {
    const res = await request(appWith("1")).get("/ip").set("X-Forwarded-For", "6.6.6.6, 1.2.3.4");
    expect(res.body.ip).toBe("1.2.3.4");
  });

  it("parses the supported forms", () => {
    expect(parseTrustProxy("")).toBe(false);
    expect(parseTrustProxy("false")).toBe(false);
    expect(parseTrustProxy("2")).toBe(2);
    expect(parseTrustProxy("loopback")).toBe("loopback");
  });
});
