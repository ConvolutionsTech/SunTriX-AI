import { v2 as cloudinary } from "cloudinary";
export { cloudinary };
import multer from "multer";
import path from "path";
import crypto from "crypto";
import { getSetting } from "../lib/configLoader";
import MediaAsset from "../models/MediaAsset";
import { logger } from "../lib/logger";

// ─── Apply current config before every operation ──────────────────────────
export function applyConfig(): void {
  cloudinary.config({
    cloud_name:  getSetting("CLOUDINARY_CLOUD_NAME") || process.env.CLOUDINARY_CLOUD_NAME,
    api_key:     getSetting("CLOUDINARY_API_KEY") || process.env.CLOUDINARY_API_KEY,
    api_secret:  getSetting("CLOUDINARY_API_SECRET") || process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

// ─── Helpers ───────────────────────────────────────────────────────────────
export function getFileHash(buffer: Buffer): string {
  return crypto.createHash("md5").update(buffer).digest("hex");
}

function getDefaultFolder(): string {
  return getSetting("UPLOAD_DEFAULT_FOLDER", "suntrix");
}

function getMaxFileSizeBytes(): number {
  const mb = parseInt(getSetting("UPLOAD_MAX_SIZE_MB", "50"));
  return mb * 1024 * 1024;
}

/** Legacy rows predate scopes and are public. */
function scopeFilter(scope: string) {
  return scope === "public" ? { $in: ["public", null] } : scope;
}

// Files a browser would run as active content if opened from the Cloudinary URL
const ACTIVE_CONTENT = /\.(html?|xhtml|svg|js|mjs|xml)$/i;
const ACTIVE_MIME = /^(text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/javascript|application\/javascript|application\/xml|text\/xml)$/i;

export function isActiveContent(file: { originalname: string; mimetype?: string }): boolean {
  if (getSetting("UPLOAD_ALLOW_SVG", "false") === "true" && (/\.svg$/i.test(file.originalname) || file.mimetype === "image/svg+xml")) return false;
  return ACTIVE_CONTENT.test(file.originalname) || ACTIVE_MIME.test(file.mimetype ?? "");
}

// ─── Multer — reads max size dynamically; refuses HTML/SVG/script files ─────
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    get fileSize() { return getMaxFileSizeBytes(); },
  },
  fileFilter(_req, file, cb) {
    if (isActiveContent(file)) return cb(Object.assign(new Error("HTML, SVG and script files can't be uploaded"), { statusCode: 400 }));
    cb(null, true);
  },
});

// ─── Upload image ──────────────────────────────────────────────────────────
export async function uploadImage(
  buffer: Buffer,
  folder?: string,
  publicId?: string,
  scope = "public"
): Promise<{ url: string; publicId: string; width?: number; height?: number; format?: string }> {
  applyConfig();
  const targetFolder = folder || getDefaultFolder();
  const hash = getFileHash(buffer);

  // DB Deduplication check
  const existingAsset = await MediaAsset.findOne({ hash, resourceType: "image", scope: scopeFilter(scope) });
  if (existingAsset) {
    return { 
      url: existingAsset.url, 
      publicId: existingAsset.publicId,
      width: existingAsset.width,
      height: existingAsset.height,
      format: existingAsset.format
    };
  }


  return new Promise((resolve, reject) => {
    const options: Record<string, unknown> = {
      resource_type: "image" as const,
      public_id: publicId || hash,
    };
    if (!publicId) options.folder = targetFolder;

    const stream = cloudinary.uploader.upload_stream(options, async (err, result) => {
      if (err || !result) return reject(err || new Error("Upload failed"));
      
      // Save to DB
      try {
        await MediaAsset.create({
          hash,
          publicId: result.public_id,
          url: result.secure_url,
          resourceType: "image",
          format: result.format,
          bytes: result.bytes,
          width: result.width,
          height: result.height,
          folder: targetFolder,
          scope
        });
      } catch (dbErr) {
        logger.error({ err: dbErr }, "Failed to save MediaAsset to DB");
      }

      resolve({ 
        url: result.secure_url, 
        publicId: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format
      });
    });
    stream.end(buffer);
  });
}

// ─── Upload video ──────────────────────────────────────────────────────────
export async function uploadVideo(
  buffer: Buffer,
  folder?: string,
  scope = "public"
): Promise<{ url: string; publicId: string; width?: number; height?: number; format?: string }> {
  applyConfig();
  const targetFolder = folder || `${getDefaultFolder()}/videos`;
  const hash = getFileHash(buffer);

  // DB Deduplication check
  const existingAsset = await MediaAsset.findOne({ hash, resourceType: "video", scope: scopeFilter(scope) });
  if (existingAsset) {
    return { 
      url: existingAsset.url, 
      publicId: existingAsset.publicId,
      width: existingAsset.width,
      height: existingAsset.height,
      format: existingAsset.format
    };
  }

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: targetFolder, public_id: hash, resource_type: "video" },
      async (err, result) => {
        if (err || !result) return reject(err || new Error("Upload failed"));
        
        // Save to DB
        try {
          await MediaAsset.create({
            hash,
            publicId: result.public_id,
            url: result.secure_url,
            resourceType: "video",
            format: result.format,
            bytes: result.bytes,
            width: result.width,
            height: result.height,
            folder: targetFolder,
            scope
          });
        } catch (dbErr) {
          logger.error({ err: dbErr }, "Failed to save MediaAsset to DB");
        }

        resolve({ 
          url: result.secure_url, 
          publicId: result.public_id,
          width: result.width,
          height: result.height,
          format: result.format
        });
      }
    );
    stream.end(buffer);
  });
}

// ─── Upload document ──────────────────────────────────────────────────────
export async function uploadDocument(
  buffer: Buffer,
  originalName: string,
  folder?: string,
  scope = "public"
): Promise<{ url: string; publicId: string; format?: string }> {
  applyConfig();
  const targetFolder = folder || `${getDefaultFolder()}/docs`;
  const hash = getFileHash(buffer);
  const ext = path.extname(originalName);

  // DB Deduplication check
  const existingAsset = await MediaAsset.findOne({ hash, resourceType: "raw", scope: scopeFilter(scope) });
  if (existingAsset) {
    return { 
      url: existingAsset.url, 
      publicId: existingAsset.publicId,
      format: existingAsset.format
    };
  }

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: targetFolder,
        resource_type: "raw",
        public_id: `${hash}${ext}`,
        use_filename: true,
        unique_filename: false,
      },
      async (err, result) => {
        if (err || !result) return reject(err || new Error("Upload failed"));
        
        // Save to DB
        try {
          await MediaAsset.create({
            hash,
            publicId: result.public_id,
            url: result.secure_url,
            resourceType: "raw",
            format: result.format || ext.replace(".", ""),
            bytes: result.bytes,
            folder: targetFolder,
            originalName,
            scope
          });
        } catch (dbErr) {
          logger.error({ err: dbErr }, "Failed to save MediaAsset to DB");
        }

        resolve({ 
          url: result.secure_url, 
          publicId: result.public_id,
          format: result.format || ext.replace(".", "")
        });
      }
    );
    stream.end(buffer);
  });
}

// ─── Delete asset (dynamically determines image/video/raw) ──────────
export async function deleteAsset(
  publicId: string,
  resourceType: "image" | "video" | "raw" = "image"
): Promise<void> {
  applyConfig();
  const asset = await MediaAsset.findOne({ publicId });
  const targetResourceType = asset?.resourceType || resourceType;

  const result = await cloudinary.uploader.destroy(publicId, { resource_type: targetResourceType });
  if (result.result === "ok" || result.result === "not_found") {
    await MediaAsset.deleteOne({ publicId });
  } else {
    logger.warn(`Cloudinary destroy returned result: ${result.result} for ${publicId}`);
    await MediaAsset.deleteOne({ publicId });
  }
}
