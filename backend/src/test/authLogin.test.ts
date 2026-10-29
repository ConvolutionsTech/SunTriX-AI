import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../app";
import { seedAdmin } from "../scripts/seedAdmin";
import { connectTestDb, disconnectTestDb } from "./helpers/db";

const creds = { email: "owner@suntrix.test", password: "correct-horse-battery", name: "Owner" };

async function timeLogin(email: string, password: string): Promise<number> {
  const start = process.hrtime.bigint();
  await request(app).post("/v1/auth/login").set("X-Forwarded-For", `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`).send({ email, password });
  return Number(process.hrtime.bigint() - start) / 1e6;
}

describe("admin login hardening (A10, M29)", () => {
  beforeAll(async () => {
    await connectTestDb();
    await seedAdmin(creds);
  }, 120000);

  afterAll(async () => {
    await disconnectTestDb();
  });

  it("counts /login, /login/ and /LOGIN against the same 5-per-15-minutes limit", async () => {
    const ip = "203.0.113.7";
    const attempt = (path: string) =>
      request(app).post(path).set("X-Forwarded-For", ip).send({ email: creds.email, password: "wrong-password-123" });

    const statuses: number[] = [];
    for (const path of ["/v1/auth/login", "/v1/auth/login/", "/v1/auth/LOGIN", "/v1/auth/Login/", "/v1/auth/login"]) {
      statuses.push((await attempt(path)).status);
    }
    expect(statuses).toEqual([401, 401, 401, 401, 401]);
    expect((await attempt("/v1/auth/login/")).status).toBe(429);
    expect((await attempt("/v1/auth/LOGIN")).status).toBe(429);
  });

  it("takes about as long for an unknown email as for a wrong password", async () => {
    const unknown: number[] = [];
    const wrong: number[] = [];
    for (let i = 0; i < 6; i++) {
      unknown.push(await timeLogin(`nobody${i}@suntrix.test`, "wrong-password-123"));
      wrong.push(await timeLogin(creds.email, "wrong-password-123"));
    }
    const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    // Before the fix an unknown email skipped bcrypt entirely (~1ms vs ~200ms)
    expect(median(unknown)).toBeGreaterThan(median(wrong) * 0.5);
  }, 60000);
});
