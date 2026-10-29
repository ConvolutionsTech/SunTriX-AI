import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../app";
import Portfolio from "../models/Portfolio";
import CaseStudy from "../models/CaseStudy";
import Post from "../models/Post";
import Team from "../models/Team";
import Pricing from "../models/Pricing";
import Client from "../models/Client";
import Department from "../models/Department";
import Testimonial from "../models/Testimonial";
import { connectTestDb, disconnectTestDb } from "./helpers/db";

const staffToken = jwt.sign({ id: "1", email: "admin@suntrix.test", role: "admin", name: "Admin" }, process.env.JWT_SECRET!);
const forgedToken = jwt.sign({ id: "1", email: "x@x.test", role: "admin", name: "X" }, "not-the-server-secret");

const draftPortfolioId = new mongoose.Types.ObjectId();
const draftCaseStudyId = new mongoose.Types.ObjectId();
const hiddenDeptId = new mongoose.Types.ObjectId();

// One public and one hidden/draft item per collection: [model, visible doc, hidden doc]
const seeds: Array<[mongoose.Model<any>, object, object]> = [
  [Portfolio, { title: "Live", slug: "live", category: "AI", status: "published" }, { _id: draftPortfolioId, title: "Secret", slug: "secret", category: "AI", status: "draft" }],
  [CaseStudy, { slug: "live-cs", status: "published" }, { _id: draftCaseStudyId, slug: "secret-cs", status: "draft" }],
  [Post, { title: "Live", slug: "live-post", status: "published" }, { title: "Secret", slug: "secret-post", status: "draft" }],
  [Team, { name: "Ada", role: "CTO", isVisible: true }, { name: "Hidden", role: "Stealth", isVisible: false }],
  [Pricing, { name: "Starter", price: 1, isVisible: true }, { name: "Unreleased", price: 2, isVisible: false }],
  [Client, { name: "Acme", isVisible: true }, { name: "NDA Client", isVisible: false }],
  [Department, { name: "Agents", enabled: true }, { _id: hiddenDeptId, name: "Skunkworks", enabled: false }],
  [Testimonial, { quote: "Great", name: "Bo", status: "published" }, { quote: "Unapproved", name: "Cy", status: "pending" }],
];

const lists: Array<[string, (body: any) => any[]]> = [
  ["/v1/portfolio?all=true", (b) => b],
  ["/v1/case-studies", (b) => b],
  ["/v1/posts?all=true", (b) => b.posts],
  ["/v1/team?all=true", (b) => b],
  ["/v1/pricing?all=true", (b) => b.plans],
  ["/v1/clients?all=true", (b) => b.clients],
  ["/v1/departments?all=true", (b) => b],
  ["/v1/testimonials", (b) => b],
];

describe("public endpoints never expose drafts or hidden items (A15, N-BR-5)", () => {
  beforeAll(async () => {
    await connectTestDb();
    for (const [model, visible, hidden] of seeds) await model.collection.insertMany([visible, hidden]);
  }, 120000);

  afterAll(async () => {
    await disconnectTestDb();
  });

  it.each(lists)("%s — anonymous and forged tokens see 1 item, staff see 2", async (path, items) => {
    const anon = await request(app).get(path);
    const garbage = await request(app).get(path).set("Authorization", "Bearer x");
    const forged = await request(app).get(path).set("Authorization", `Bearer ${forgedToken}`);
    const staff = await request(app).get(path).set("Authorization", `Bearer ${staffToken}`);

    expect(items(anon.body)).toHaveLength(1);
    expect(items(garbage.body)).toHaveLength(1);
    expect(items(forged.body)).toHaveLength(1);
    expect(items(staff.body)).toHaveLength(2);
  });

  it.each([
    `/v1/portfolio/slug/secret`,
    `/v1/portfolio/${draftPortfolioId}`,
    `/v1/case-studies/slug/secret-cs`,
    `/v1/case-studies/${draftCaseStudyId}`,
    `/v1/departments/${hiddenDeptId}`,
  ])("draft detail %s → 404 anonymously, 200 for staff", async (path) => {
    expect((await request(app).get(path)).status).toBe(404);
    expect((await request(app).get(path).set("Authorization", `Bearer ${staffToken}`)).status).toBe(200);
  });
});
