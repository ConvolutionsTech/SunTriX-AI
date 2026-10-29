import mongoose, { Schema, Document } from "mongoose";

export type PostStatus = "draft" | "published" | "scheduled";

export interface IMediaAttachment {
  url: string;
  type: "image" | "video" | "document";
  name: string;
  publicId: string;
  size?: number;
}

export interface IPost extends Document {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  coverImage: string;
  author: string;
  tags: string[];
  category: string;
  readTimeMinutes: number;
  status: PostStatus;
  featured: boolean;
  views: number;
  publishAt?: Date;
  publishedAt?: Date;
  mediaAttachments: IMediaAttachment[];
}

const MediaAttachmentSchema = new Schema<IMediaAttachment>(
  {
    url: { type: String, required: true },
    type: { type: String, enum: ["image", "video", "document"], required: true },
    name: { type: String, default: "" },
    publicId: { type: String, default: "" },
    size: { type: Number, default: 0 },
  },
  { _id: false }
);

const PostSchema = new Schema<IPost>(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    excerpt: { type: String, default: "" },
    content: { type: String, default: "" },
    coverImage: { type: String, default: "" },
    author: { type: String, default: "SunTriX Team" },
    tags: [{ type: String }],
    category: { type: String, default: "Insights" },
    readTimeMinutes: { type: Number, default: 5 },
    status: {
      type: String,
      enum: ["draft", "published", "scheduled"],
      default: "draft",
    },
    featured: { type: Boolean, default: false },
    views: { type: Number, default: 0 },
    publishAt: { type: Date },
    publishedAt: { type: Date },
    mediaAttachments: { type: [MediaAttachmentSchema], default: [] },
  },
  { timestamps: true }
);

PostSchema.index({ status: 1, publishedAt: -1 });
PostSchema.index({ tags: 1 });
PostSchema.index({ category: 1 });

export default mongoose.model<IPost>("Post", PostSchema);
