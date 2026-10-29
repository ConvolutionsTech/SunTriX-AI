import mongoose, { Schema, Document } from "mongoose";

/**
 * MediaAsset — every file uploaded to Cloudinary, keyed by content hash and scope.
 * The media library lists the "public" scope from here; re-uploading the same
 * bytes within a scope returns the existing file instead of a duplicate.
 */
export interface IMediaAsset extends Document {
  // MD5 hash of the file buffer — the dedup key
  hash: string;
  publicId: string;        // Cloudinary public_id (includes folder prefix)
  url: string;             // Cloudinary secure_url
  resourceType: "image" | "video" | "raw";
  format: string;          // jpg, png, mp4, pdf, etc.
  bytes: number;
  width?: number;
  height?: number;
  folder: string;          // the folder it was originally uploaded to
  originalName?: string;   // original filename (for documents)
  scope: string;           // "public" (media library) or "project:<taskRequestId>" (client files)
  createdAt: Date;
  updatedAt: Date;
}

const MediaAssetSchema = new Schema<IMediaAsset>(
  {
    hash:         { type: String, required: true },
    publicId:     { type: String, required: true, unique: true },
    url:          { type: String, required: true },
    resourceType: { type: String, enum: ["image", "video", "raw"], required: true },
    format:       { type: String, default: "" },
    bytes:        { type: Number, default: 0 },
    width:        { type: Number },
    height:       { type: Number },
    folder:       { type: String, default: "suntrix" },
    originalName: { type: String, default: "" },
    scope:        { type: String, default: "public" },
  },
  { timestamps: true }
);

// Dedup is per scope: the same bytes in a client project and in the public library are separate files
MediaAssetSchema.index({ hash: 1, resourceType: 1, scope: 1 }, { unique: true });
MediaAssetSchema.index({ scope: 1, resourceType: 1, createdAt: -1 });
MediaAssetSchema.index({ createdAt: -1 });

export default mongoose.model<IMediaAsset>("MediaAsset", MediaAssetSchema);
