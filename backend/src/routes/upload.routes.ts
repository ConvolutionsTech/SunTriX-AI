import { Router, Request, Response, NextFunction } from "express";
import { upload, uploadImage, uploadVideo, uploadDocument, cloudinary, deleteAsset, applyConfig } from "../services/cloudinary";
import MediaAsset from "../models/MediaAsset";
import { requireAuth } from "../middleware/auth";
import { createError } from "../middleware/errorHandler";
import path from "path";

const router = Router();

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

// GET /upload — list all assets from Cloudinary & DB (admin only)
router.get("/", requireAuth, async (_req: Request, res: Response, _next: NextFunction) => {
  try {
    applyConfig();
    const result = await cloudinary.api.resources({
      type: "upload",
      prefix: "suntrix",
      max_results: 200,
      resource_type: "image",
    }).catch(() => ({ resources: [] }));

    const imageAssets = result.resources.map((r: Record<string, unknown>) => ({
      _id: (r.asset_id as string) || (r.public_id as string),
      publicId: r.public_id as string,
      url: r.url as string,
      secureUrl: r.secure_url as string,
      resourceType: "image",
      format: r.format as string,
      width: r.width as number,
      height: r.height as number,
      bytes: r.bytes as number,
      folder: (r.folder as string) || "suntrix",
      createdAt: r.created_at as string,
    }));

    // Fetch videos
    const videoResult = await cloudinary.api
      .resources({
        type: "upload",
        prefix: "suntrix",
        max_results: 100,
        resource_type: "video",
      })
      .catch(() => ({ resources: [] }));

    const videoAssets = videoResult.resources.map((r: Record<string, unknown>) => ({
      _id: (r.asset_id as string) || (r.public_id as string),
      publicId: r.public_id as string,
      url: r.url as string,
      secureUrl: r.secure_url as string,
      resourceType: "video",
      format: r.format as string,
      width: r.width as number,
      height: r.height as number,
      bytes: r.bytes as number,
      folder: (r.folder as string) || "suntrix",
      createdAt: r.created_at as string,
    }));

    // Fetch raw documents/files (including .md, .pdf, .zip, etc.)
    const rawResult = await cloudinary.api
      .resources({
        type: "upload",
        prefix: "suntrix",
        max_results: 100,
        resource_type: "raw",
      })
      .catch(() => ({ resources: [] }));

    const rawAssets = rawResult.resources.map((r: Record<string, unknown>) => ({
      _id: (r.asset_id as string) || (r.public_id as string),
      publicId: r.public_id as string,
      url: r.url as string,
      secureUrl: r.secure_url as string,
      resourceType: "raw",
      format: (r.format as string) || path.extname(r.public_id as string).replace(".", ""),
      bytes: r.bytes as number,
      folder: (r.folder as string) || "suntrix",
      createdAt: r.created_at as string,
    }));

    // Deduplicate existing Cloudinary assets by hash/filename
    const uniqueAssets = new Map<string, any>();
    [...imageAssets, ...videoAssets, ...rawAssets].forEach((asset: any) => {
      const parts = asset.publicId.split("/");
      const hashOrName = parts[parts.length - 1];
      if (!uniqueAssets.has(hashOrName)) {
        uniqueAssets.set(hashOrName, asset);
      }
    });

    res.json(Array.from(uniqueAssets.values()));
  } catch (err: any) {
    // Fallback to MongoDB MediaAssets if Cloudinary call fails
    try {
      const dbAssets = await MediaAsset.find({}).sort({ createdAt: -1 }).limit(500).lean();
      return res.json(
        dbAssets.map((a: any) => ({
          _id: a._id.toString(),
          publicId: a.publicId || a._id.toString(),
          url: a.url,
          secureUrl: a.url,
          resourceType: a.resourceType || "raw",
          bytes: a.bytes || 0,
          folder: a.folder || "suntrix",
          createdAt: a.createdAt,
        }))
      );
    } catch {
      return res.json([]);
    }
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
      const folder = (req.body.folder as string) || "suntrix";

      // If user uploaded a video, auto-forward to uploadVideo
      if (isVideoFile(req.file)) {
        const videoResult = await uploadVideo(req.file.buffer, folder || "suntrix/videos");
        return res.json({
          _id: videoResult.publicId,
          publicId: videoResult.publicId,
          url: videoResult.url,
          secureUrl: videoResult.url,
          resourceType: "video",
          format: path.extname(req.file.originalname).replace(".", "") || "mp4",
          bytes: req.file.size,
          folder: folder || "suntrix/videos",
          createdAt: new Date().toISOString(),
        });
      }

      // If non-image document file (e.g. .md, .pdf, .zip, .docx), auto-forward to uploadDocument
      if (!isImageFile(req.file)) {
        const docResult = await uploadDocument(req.file.buffer, req.file.originalname, folder || "suntrix/docs");
        return res.json({
          _id: docResult.publicId,
          publicId: docResult.publicId,
          url: docResult.url,
          secureUrl: docResult.url,
          resourceType: "raw",
          format: path.extname(req.file.originalname).replace(".", ""),
          name: req.file.originalname,
          bytes: req.file.size,
          folder: folder || "suntrix/docs",
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
      const folder = (req.body.folder as string) || "suntrix/videos";

      if (isImageFile(req.file)) {
        const imgResult = await uploadImage(req.file.buffer, folder || "suntrix");
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
        const docResult = await uploadDocument(req.file.buffer, req.file.originalname, folder || "suntrix/docs");
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
      const folder = (req.body.folder as string) || "suntrix/docs";
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

// DELETE /upload/bulk — bulk delete from Cloudinary (admin only)
router.delete("/bulk", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { publicIds } = req.body;
    if (!Array.isArray(publicIds)) return next(createError("publicIds array required", 400));

    if (publicIds.length > 0) {
      await cloudinary.api.delete_resources(publicIds);
      await MediaAsset.deleteMany({ publicId: { $in: publicIds } });
    }

    res.json({ success: true, count: publicIds.length });
  } catch (err) {
    next(err);
  }
});

// DELETE /upload/:publicId — delete asset from Cloudinary (admin only)
router.delete("/:publicId", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const publicId = Buffer.from(req.params.publicId, "base64").toString("utf-8");
    await deleteAsset(publicId);
    await MediaAsset.deleteOne({ publicId });
    res.json({ success: true, message: "Asset deleted" });
  } catch (err) {
    next(err);
  }
});

export default router;
