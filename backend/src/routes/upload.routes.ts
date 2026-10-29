import { Router, Request, Response, NextFunction } from "express";
import { upload, uploadImage, uploadVideo, uploadDocument, cloudinary, deleteAsset, applyConfig } from "../services/cloudinary";
import MediaAsset from "../models/MediaAsset";
import { requireAuth } from "../middleware/auth";
import { createError } from "../middleware/errorHandler";
import { pageParams, setTotal } from "../middleware/pagination";
import { getSetting } from "../lib/configLoader";
import path from "path";

const router = Router();

const libraryRoot = () => getSetting("UPLOAD_DEFAULT_FOLDER", "suntrix");
const SUBFOLDERS = new Set(["", "videos", "docs", "blog", "portfolio", "team", "clients", "images"]);

/** Uploads go to the library root or one of its known subfolders; anything else is refused. */
function uploadFolder(requested: unknown, fallbackSub: string): string {
  const root = libraryRoot();
  if (requested === undefined || requested === "") return fallbackSub ? `${root}/${fallbackSub}` : root;
  const value = String(requested);
  const sub = value === root ? "" : value.startsWith(`${root}/`) ? value.slice(root.length + 1) : null;
  if (sub === null || !SUBFOLDERS.has(sub)) throw createError(`folder must be ${root} or one of its subfolders`, 400);
  return value;
}

function isImageFile(file: Express.Multer.File): boolean {
  const ext = path.extname(file.originalname).toLowerCase();
  return (
    file.mimetype?.startsWith("image/") ||
    [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp", ".ico", ".tiff", ".heic"].includes(ext)
  );
}

function isVideoFile(file: Express.Multer.File): boolean {
  const ext = path.extname(file.originalname).toLowerCase();
  return (
    file.mimetype?.startsWith("video/") ||
    [".mp4", ".mov", ".webm", ".avi", ".mkv", ".flv", ".wmv"].includes(ext)
  );
}

// GET /upload?type=image|video|raw&limit&skip — the public media library, from MongoDB
// (client project files are not listed). Total in X-Total-Count.
router.get("/", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filter: Record<string, unknown> = { scope: { $in: ["public", null] } };
    if (typeof req.query.type === "string" && ["image", "video", "raw"].includes(req.query.type)) filter.resourceType = req.query.type;
    const { limit, skip } = pageParams(req, { defaultLimit: 500, maxLimit: 1000 });
    const [assets, total] = await Promise.all([
      MediaAsset.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      MediaAsset.countDocuments(filter),
    ]);
    setTotal(res, total);
    res.json(
      assets.map((a) => ({
        _id: String(a._id),
        publicId: a.publicId,
        url: a.url,
        secureUrl: a.url,
        resourceType: a.resourceType,
        format: a.format,
        width: a.width,
        height: a.height,
        bytes: a.bytes,
        folder: a.folder,
        name: a.originalName || undefined,
        createdAt: a.createdAt,
      }))
    );
  } catch (err) {
    next(err);
  }
});

// POST /upload/image — smart route supporting any file type
router.post(
  "/image",
  requireAuth,
  upload.single("file"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) return next(createError("No file uploaded", 400));
      const folder = uploadFolder(req.body.folder, "");

      // If user uploaded a video, auto-forward to uploadVideo
      if (isVideoFile(req.file)) {
        const videoResult = await uploadVideo(req.file.buffer, folder);
        return res.json({
          _id: videoResult.publicId,
          publicId: videoResult.publicId,
          url: videoResult.url,
          secureUrl: videoResult.url,
          resourceType: "video",
          format: path.extname(req.file.originalname).replace(".", "") || "mp4",
          bytes: req.file.size,
          folder: folder,
          createdAt: new Date().toISOString(),
        });
      }

      // If non-image document file (e.g. .md, .pdf, .zip, .docx), auto-forward to uploadDocument
      if (!isImageFile(req.file)) {
        const docResult = await uploadDocument(req.file.buffer, req.file.originalname, folder);
        return res.json({
          _id: docResult.publicId,
          publicId: docResult.publicId,
          url: docResult.url,
          secureUrl: docResult.url,
          resourceType: "raw",
          format: path.extname(req.file.originalname).replace(".", ""),
          name: req.file.originalname,
          bytes: req.file.size,
          folder: folder,
          createdAt: new Date().toISOString(),
        });
      }

      const result = await uploadImage(req.file.buffer, folder);
      res.json({
        _id: result.publicId,
        publicId: result.publicId,
        url: result.url,
        secureUrl: result.url,
        resourceType: "image",
        format: path.extname(req.file.originalname).replace(".", "") || "jpg",
        bytes: req.file.size,
        folder,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /upload/video — smart route supporting any file type
router.post(
  "/video",
  requireAuth,
  upload.single("file"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) return next(createError("No file uploaded", 400));
      const folder = uploadFolder(req.body.folder, "videos");

      if (isImageFile(req.file)) {
        const imgResult = await uploadImage(req.file.buffer, folder);
        return res.json({
          _id: imgResult.publicId,
          publicId: imgResult.publicId,
          url: imgResult.url,
          secureUrl: imgResult.url,
          resourceType: "image",
          format: path.extname(req.file.originalname).replace(".", "") || "jpg",
          bytes: req.file.size,
          folder,
          createdAt: new Date().toISOString(),
        });
      }

      if (!isVideoFile(req.file)) {
        const docResult = await uploadDocument(req.file.buffer, req.file.originalname, folder);
        return res.json({
          _id: docResult.publicId,
          publicId: docResult.publicId,
          url: docResult.url,
          secureUrl: docResult.url,
          resourceType: "raw",
          format: path.extname(req.file.originalname).replace(".", ""),
          name: req.file.originalname,
          bytes: req.file.size,
          folder,
          createdAt: new Date().toISOString(),
        });
      }

      const result = await uploadVideo(req.file.buffer, folder);
      res.json({
        _id: result.publicId,
        publicId: result.publicId,
        url: result.url,
        secureUrl: result.url,
        resourceType: "video",
        format: path.extname(req.file.originalname).replace(".", "") || "mp4",
        bytes: req.file.size,
        folder,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /upload/document — supports any file type (.md, .pdf, .zip, .docx, .csv, .json, etc.)
router.post(
  "/document",
  requireAuth,
  upload.single("file"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) return next(createError("No file uploaded", 400));
      const folder = uploadFolder(req.body.folder, "docs");
      const result = await uploadDocument(req.file.buffer, req.file.originalname, folder);
      const ext = path.extname(req.file.originalname).toLowerCase();
      res.json({
        _id: result.publicId,
        publicId: result.publicId,
        url: result.url,
        secureUrl: result.url,
        resourceType: "raw",
        format: ext.replace(".", ""),
        name: req.file.originalname,
        bytes: req.file.size,
        folder,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

/** Only files in the public media library can be deleted here (never client project files). */
async function deletableAssets(ids: string[]): Promise<{ publicId: string; resourceType: "image" | "video" | "raw" }[]> {
  const root = `${libraryRoot()}/`;
  const out: { publicId: string; resourceType: "image" | "video" | "raw" }[] = [];
  for (const publicId of ids) {
    if (typeof publicId !== "string" || !publicId.startsWith(root)) throw createError(`Only files in ${root} can be deleted here`, 400);
    const asset = await MediaAsset.findOne({ publicId }).select("resourceType scope").lean();
    if (asset?.scope && asset.scope !== "public") throw createError("Client project files can't be deleted from the media library", 400);
    out.push({ publicId, resourceType: asset?.resourceType ?? "image" });
  }
  return out;
}

// DELETE /upload/bulk { publicIds } — Cloudinary deletes are per resource type
router.delete("/bulk", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { publicIds } = req.body;
    if (!Array.isArray(publicIds) || publicIds.length > 100) return next(createError("publicIds must be an array of at most 100 ids", 400));
    const assets = await deletableAssets(publicIds);
    applyConfig();
    for (const type of ["image", "video", "raw"] as const) {
      const ids = assets.filter((a) => a.resourceType === type).map((a) => a.publicId);
      if (ids.length) await cloudinary.api.delete_resources(ids, { resource_type: type });
    }
    await MediaAsset.deleteMany({ publicId: { $in: assets.map((a) => a.publicId) } });
    res.json({ success: true, count: assets.length });
  } catch (err) {
    next(err);
  }
});

/** `:id` is the MediaAsset _id; base64 / base64url public ids are still accepted from older clients. */
async function resolvePublicId(id: string): Promise<string> {
  if (/^[a-f\d]{24}$/i.test(id)) {
    const asset = await MediaAsset.findById(id).select("publicId").lean();
    if (!asset) throw createError("Asset not found", 404);
    return asset.publicId;
  }
  return Buffer.from(id.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

// DELETE /upload/:id
router.delete("/:id", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [asset] = await deletableAssets([await resolvePublicId(req.params.id)]);
    await deleteAsset(asset.publicId, asset.resourceType);
    res.json({ success: true, message: "Asset deleted" });
  } catch (err) {
    next(err);
  }
});

export default router;
