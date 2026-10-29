import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../app";
import Post from "../models/Post";
import Portfolio from "../models/Portfolio";
import { connectTestDb, disconnectTestDb } from "./helpers/db";

describe("sitemap (T-OPB-19)", () => {
  beforeAll(async () => {
    await connectTestDb();
    await Post.create([
      { title: "A", slug: "first-post", content: "c", status: "published" },
      { title: "B", slug: "second-post", content: "c", status: "published" },
      { title: "C", slug: "secret-draft", content: "c", status: "draft" },
    ]);
    await Portfolio.create([
      { title: "P", slug: "shipped-project", category: "AI", description: "d", status: "published" },
      { title: "Q", slug: "unreleased", category: "AI", description: "d", status: "draft" },
    ]);
  }, 120000);

  afterAll(async () => {
    await disconnectTestDb();
  });

  it("lists static pages and only published posts and projects", async () => {
    const res = await request(app).get("/v1/sitemap.xml");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/xml");
    expect(res.headers["cache-control"]).toBe("public, max-age=3600");
    const xml = res.text;
    expect(xml).toContain("<urlset");
    expect(xml).toContain("/blog/first-post</loc>");
    expect(xml).toContain("/blog/second-post</loc>");
    expect(xml).toContain("/work/shipped-project</loc>");
    expect(xml).toContain("/legal/privacy</loc>");
    for (const hidden of ["secret-draft", "unreleased", "/admin", "/proposal/", "/invoice/"]) expect(xml).not.toContain(hidden);
  });
});
