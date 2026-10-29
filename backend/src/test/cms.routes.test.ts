import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import request from "supertest";
import app from "../app";
import CmsContent from "../models/CmsContent";
import { connectTestDb, clearTestDb, disconnectTestDb } from "./helpers/db";
import { staffToken } from "./helpers/auth";

describe("CMS content (T-BR-11, T-OPA-14)", () => {
  let admin: Record<string, string>;

  beforeAll(async () => {
    await connectTestDb();
  }, 120000);

  afterEach(async () => {
    await clearTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it("public reads never create documents", async () => {
    for (let i = 0; i < 50; i++) {
      const res = await request(app).get(`/v1/cms/seo/random-${i}`);
      expect(res.status).toBe(404);
    }
    const seo = await request(app).get("/v1/cms/seo/home");
    expect(seo.body).toMatchObject({ page: "home", title: expect.any(String) });
    for (const key of ["hero", "announcement", "company", "social-links", "intro-video", "media-registry"]) {
      expect((await request(app).get(`/v1/cms/${key}`)).status).toBe(200);
    }
    expect(await CmsContent.countDocuments()).toBe(0);
  });

  it("an admin save is returned by later reads", async () => {
    admin = { Authorization: `Bearer ${await staffToken("admin")}` };
    const hero = { headline: ["Hello"], ctaPrimary: { text: "Go", link: "/request-task" } };
    expect((await request(app).put("/v1/cms/hero").set(admin).send(hero)).status).toBe(200);
    expect((await request(app).get("/v1/cms/hero")).body).toMatchObject(hero);
    expect((await request(app).put("/v1/cms/seo/pricing").set(admin).send({ title: "Pricing" })).body).toEqual({ title: "Pricing", page: "pricing" });
  });

  it("rejects script and data links, bad emails and unknown SEO pages", async () => {
    admin = { Authorization: `Bearer ${await staffToken("admin")}` };
    const bad = [
      ["/v1/cms/social-links", { links: [{ platform: "X", url: "javascript:alert(1)" }] }],
      ["/v1/cms/announcement", { link: "data:text/html,hi" }],
      ["/v1/cms/announcement", { link: "//evil.example" }],
      ["/v1/cms/hero", { ctaPrimary: { text: "Go", link: "JavaScript:alert(1)" } }],
      ["/v1/cms/company", { email: "not-an-email" }],
      ["/v1/cms/intro-video", { url: "ftp://x" }],
      ["/v1/cms/seo/whatever", { title: "x" }],
    ] as const;
    for (const [url, body] of bad) {
      const res = await request(app).put(url).set(admin).send(body);
      expect(res.status, `${url} ${JSON.stringify(body)}`).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    }
    expect(await CmsContent.countDocuments()).toBe(0);
  });

  it("the media registry maps known image slots to http(s) URLs (T-FE-13)", async () => {
    admin = { Authorization: `Bearer ${await staffToken("admin")}` };
    expect((await request(app).get("/v1/cms/media-registry")).body).toEqual({ entries: {} });
    const entries = { "hero-banner": "https://res.cloudinary.com/x/hero.png" };
    expect((await request(app).put("/v1/cms/media-registry").set(admin).send({ entries })).status).toBe(200);
    expect((await request(app).get("/v1/cms/media-registry")).body).toEqual({ entries });
    expect((await request(app).put("/v1/cms/media-registry").set(admin).send({ entries: { "not-a-slot": "https://x" } })).status).toBe(400);
    expect((await request(app).put("/v1/cms/media-registry").set(admin).send({ entries: { "hero-banner": "javascript:alert(1)" } })).status).toBe(400);
  });

  it("viewers can't edit content", async () => {
    const viewer = { Authorization: `Bearer ${await staffToken("viewer")}` };
    expect((await request(app).put("/v1/cms/hero").set(viewer).send({ badge: "x" })).status).toBe(403);
  });
});
