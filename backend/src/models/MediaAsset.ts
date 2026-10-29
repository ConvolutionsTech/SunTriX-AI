import mongoose, { Schema, Document } from "mongoose";

/**
 * MediaAsset — tracks every file uploaded to Cloudinary by its content hash.
 * Purpose: prevent duplicate uploads regardless of which folder or page triggered the upload.
 * If the same file bytes are uploaded anywhere, the existing Cloudinary URL is returned immediately.
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
  createdAt: Date;
  updatedAt: Date;
}

const MediaAssetSchema = new Schema<IMediaAsset>(
  {
    hash:         { type: String, required: true, unique: true, index: true },
    publicId:     { type: String, required: true, unique: true },
    url:          { type: String, required: true },
    resourceType: { type: String, enum: ["image", "video", "raw"], required: true },
    format:       { type: String, default: "" },
    bytes:        { type: Number, default: 0 },
    width:        { type: Number },
    height:       { type: Number },
    folder:       { type: String, default: "suntrix" },
    originalName: { type: String, default: "" },
  },
  { timestamps: true }
);

MediaAssetSchema.index({ createdAt: -1 });

export default mongoose.model<IMediaAsset>("MediaAsset", MediaAssetSchema);
