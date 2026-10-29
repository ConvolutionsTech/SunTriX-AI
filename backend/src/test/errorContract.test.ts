import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import app from "../app";
import { errorHandler } from "../middleware/errorHandler";
import { connectTestDb, clearTestDb, disconnectTestDb } from "./helpers/db";
import { staffToken } from "./helpers/auth";

describe("error contract (A21, M13)", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120000);

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await clearTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it("an invalid id is a 400, not a 500", async () => {
    const res = await request(app).get("/v1/posts/not-an-id").set("Authorization", `Bearer ${await staffToken("admin")}`);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "Invalid id", code: "INVALID_ID" });
  });

  it("a duplicate value is a 409 naming the field", async () => {
    const auth = { Authorization: `Bearer ${await staffToken("admin")}` };
    const post = { title: "Hello", slug: "hello", content: "<p>x</p>" };
    expect((await request(app).post("/v1/posts").set(auth).send(post)).status).toBe(201);
    const dup = await request(app).post("/v1/posts").set(auth).send(post);
    expect(dup.status).toBe(409);
    expect(dup.body).toMatchObject({ code: "DUPLICATE", error: "That slug is already in use" });
  });

  it("an unknown browser origin is a 403", async () => {
    const res = await request(app).get("/v1/posts").set("Origin", "https://evil.example");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CORS");
  });

  it("malformed JSON is a 400", async () => {
    const res = await request(app).post("/v1/contact").set("Content-Type", "application/json").send("{not json");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("BAD_JSON");
  });

  it("unexpected errors in production hide internals but are logged", () => {
    vi.stubEnv("NODE_ENV", "production");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const json = vi.fn();
    const res = { status: vi.fn(() => ({ json })) } as any;
    errorHandler(new Error("connect ECONNREFUSED 10.0.0.5:27017"), { method: "GET", originalUrl: "/v1/x", id: "req-1" } as any, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({ error: "Internal Server Error", requestId: "req-1" });
    expect(log).toHaveBeenCalled();
  });
});
