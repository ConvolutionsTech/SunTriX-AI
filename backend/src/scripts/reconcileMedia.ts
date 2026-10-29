/**
 * One-off import of files that exist in Cloudinary under the media-library
 * folder but have no MediaAsset row (uploaded before the library was
 * DB-backed), so they show up in Admin → Media again. Idempotent.
 *
 * Run: npm run media:reconcile        (dev, ts-node)
 *      npm run media:reconcile:prod   (built image)
 */
import "dotenv/config";
import mongoose from "mongoose";
import MediaAsset from "../models/MediaAsset";
import { cloudinary, applyConfig } from "../services/cloudinary";

interface CloudinaryResource {
  asset_id: string;
  public_id: string;
  secure_url: string;
  format?: string;
  bytes?: number;
  width?: number;
  height?: number;
  folder?: string;
  created_at?: string;
}

export async function reconcileMedia(prefix: string): Promise<number> {
  applyConfig();
  let imported = 0;
  for (const resourceType of ["image", "video", "raw"] as const) {
    let cursor: string | undefined;
    do {
      const page = await cloudinary.api.resources({ type: "upload", prefix, resource_type: resourceType, max_results: 500, next_cursor: cursor });
      for (const r of page.resources as CloudinaryResource[]) {
        const res = await MediaAsset.updateOne(
          { publicId: r.public_id },
          {
            $setOnInsert: {
              hash: `cloudinary:${r.asset_id}`, publicId: r.public_id, url: r.secure_url, resourceType,
              format: r.format ?? "", bytes: r.bytes ?? 0, width: r.width, height: r.height,
              folder: r.folder || prefix, scope: "public", createdAt: r.created_at ? new Date(r.created_at) : new Date(),
            },
          },
          { upsert: true }
        );
        imported += res.upsertedCount;
      }
      cursor = page.next_cursor;
    } while (cursor);
  }
  return imported;
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(uri);
  try {
    const prefix = process.env.UPLOAD_DEFAULT_FOLDER || "suntrix";
    const n = await reconcileMedia(prefix);
    console.log(`✅ Imported ${n} file(s) from Cloudinary folder "${prefix}"`);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().then(
    () => process.exit(0),
    (err) => {
      console.error(`❌ Media reconcile failed: ${err.message}`);
      process.exit(1);
    }
  );
}
