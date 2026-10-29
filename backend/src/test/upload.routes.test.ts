import { describe, it, expect, vi, beforeAll, afterEach, afterAll } from "vitest";
import request from "supertest";
import app from "../app";
import MediaAsset from "../models/MediaAsset";
import { cloudinary, uploadImage } from "../services/cloudinary";
import { connectTestDb, clearTestDb, disconnectTestDb } from "./helpers/db";
import { staffToken } from "./helpers/auth";

/** Cloudinary upload double: every upload succeeds with a public_id under the requested folder. */
function mockCloudinary() {
  let n = 0;
  vi.spyOn(cloudinary.uploader, "upload_stream").mockImplementation(((options: Record<string, string>, cb: (e: unknown, r: unknown) => void) => ({
    end: () => {
      n++;
      const publicId = `${options.folder ? `${options.folder}/` : ""}${options.public_id}`;
      cb(null, { public_id: publicId, secure_url: `https://res.cloudinary.com/x/${publicId}`, format: "png", bytes: 3, width: 1, height: 1 });
    },
  })) as never);
  const destroy = vi.spyOn(cloudinary.uploader, "destroy").mockResolvedValue({ result: "ok" } as never);
  const deleteResources = vi.spyOn(cloudinary.api, "delete_resources").mockResolvedValue({} as never);
  return { uploads: () => n, destroy, deleteResources };
}

const PNG = Buffer.from([0x89, 0x50, 0x4e]);

describe("media library (T-BR-12, T-OPA-13)", () => {
  let auth: Record<string, string>;

  beforeAll(async () => {
    await connectTestDb();
  }, 120000);

  afterEach(async () => {
    vi.restoreAllMocks();
    await clearTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  const admin = async () => (auth = { Authorization: `Bearer ${await staffToken("admin")}` });

  it("dedups within a scope but keeps client project files separate from the public library", async () => {
    const cld = mockCloudinary();
    const a = await uploadImage(PNG, "suntrix");
    const again = await uploadImage(PNG, "suntrix");
    const project = await uploadImage(PNG, "projects/t1/files", undefined, "project:t1");
    expect(again.publicId).toBe(a.publicId);
    expect(project.publicId).not.toBe(a.publicId);
    expect(cld.uploads()).toBe(2);
    expect(await MediaAsset.countDocuments()).toBe(2);
  });

  it("lists only the public library from MongoDB, paged with a total", async () => {
    await admin();
    await MediaAsset.insertMany([
      ...Array.from({ length: 210 }, (_, i) => ({ hash: `h${i}`, publicId: `suntrix/f${i}`, url: `https://x/${i}`, resourceType: "image", scope: "public" })),
      { hash: "p", publicId: "projects/t1/files/p", url: "https://x/p", resourceType: "raw", scope: "project:t1" },
    ]);
    const res = await request(app).get("/v1/upload?limit=100&skip=200").set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(10);
    expect(res.headers["x-total-count"]).toBe("210");
    expect((await request(app).get("/v1/upload").set(auth)).body).toHaveLength(210);
  });

  it("refuses uploads outside the library folders and active-content files", async () => {
    await admin();
    mockCloudinary();
    const outside = await request(app).post("/v1/upload/image").set(auth).field("folder", "projects/abc").attach("file", PNG, "a.png");
    expect(outside.status).toBe(400);
    const html = await request(app).post("/v1/upload/document").set(auth).attach("file", Buffer.from("<script>"), "x.html");
    expect(html.status).toBe(400);
    const svg = await request(app).post("/v1/upload/image").set(auth).attach("file", Buffer.from("<svg/>"), { filename: "x.svg", contentType: "image/svg+xml" });
    expect(svg.status).toBe(400);
    const ok = await request(app).post("/v1/upload/image").set(auth).field("folder", "suntrix/blog").attach("file", PNG, "a.png");
    expect(ok.status).toBe(200);
  });

  it("deletes by asset id with the right resource type; refuses project files and other folders", async () => {
    await admin();
    const cld = mockCloudinary();
    const video = await MediaAsset.create({ hash: "v", publicId: "suntrix/videos/v", url: "https://x/v", resourceType: "video", scope: "public" });
    const project = await MediaAsset.create({ hash: "p", publicId: "suntrix/p", url: "https://x/p", resourceType: "raw", scope: "project:t1" });

    expect((await request(app).delete(`/v1/upload/${video._id}`).set(auth)).status).toBe(200);
    expect(cld.destroy).toHaveBeenCalledWith("suntrix/videos/v", { resource_type: "video" });
    expect(await MediaAsset.findById(video._id)).toBeNull();

    expect((await request(app).delete(`/v1/upload/${project._id}`).set(auth)).status).toBe(400);
    const legacy = Buffer.from("projects/abc/files/x").toString("base64url");
    expect((await request(app).delete(`/v1/upload/${legacy}`).set(auth)).status).toBe(400);
    expect((await request(app).delete("/v1/upload/bulk").set(auth).send({ publicIds: ["projects/abc/files/x"] })).status).toBe(400);
  });

  it("bulk delete calls Cloudinary once per resource type", async () => {
    await admin();
    const cld = mockCloudinary();
    await MediaAsset.insertMany([
      { hash: "1", publicId: "suntrix/i1", url: "u", resourceType: "image" },
      { hash: "2", publicId: "suntrix/videos/v1", url: "u", resourceType: "video" },
      { hash: "3", publicId: "suntrix/docs/d1.pdf", url: "u", resourceType: "raw" },
    ]);
    const res = await request(app).delete("/v1/upload/bulk").set(auth).send({ publicIds: ["suntrix/i1", "suntrix/videos/v1", "suntrix/docs/d1.pdf"] });
    expect(res.status).toBe(200);
    expect(cld.deleteResources).toHaveBeenCalledWith(["suntrix/i1"], { resource_type: "image" });
    expect(cld.deleteResources).toHaveBeenCalledWith(["suntrix/videos/v1"], { resource_type: "video" });
    expect(cld.deleteResources).toHaveBeenCalledWith(["suntrix/docs/d1.pdf"], { resource_type: "raw" });
    expect(await MediaAsset.countDocuments()).toBe(0);
  });
});
