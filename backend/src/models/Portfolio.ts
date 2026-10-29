import mongoose, { Schema, Document } from "mongoose";

export interface IPortfolioProject extends Document {
  title: string;
  slug: string;
  category: string;
  description: string;
  shortDescription: string;
  metric: string;
  metricLabel: string;
  coverImage: string;
  thumbnailImage: string;
  images: string[];
  videoUrl: string;
  tags: string[];
  tools: { name: string; icon: string }[];
  clientLogo: string;
  clientName: string;
  industry: string;
  highlights: string[];
  status: "published" | "draft" | "scheduled";
  featured: boolean;
  order: number;
  displayType: "video" | "images";
  liveUrl: string;
  publishAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PortfolioSchema = new Schema<IPortfolioProject>(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    category: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    shortDescription: { type: String, default: "" },
    metric: { type: String, default: "" },
    metricLabel: { type: String, default: "" },
    coverImage: { type: String, default: "" },
    thumbnailImage: { type: String, default: "" },
    images: [{ type: String }],
    videoUrl: { type: String, default: "" },
    liveUrl: { type: String, default: "" },
    displayType: { type: String, enum: ["video", "images"], default: "video" },
    tags: [{ type: String }],
    tools: [{ name: String, icon: String }],
    clientLogo: { type: String, default: "" },
    clientName: { type: String, default: "" },
    industry: { type: String, default: "" },
    highlights: [{ type: String }],
    // "scheduled" + publishAt: the scheduler publishes it; a draft is never published automatically
    status: { type: String, enum: ["published", "draft", "scheduled"], default: "draft" },
    featured: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
    publishAt: { type: Date },
  },
  { timestamps: true }
);

PortfolioSchema.index({ status: 1, order: 1 });
PortfolioSchema.index({ featured: 1, status: 1 });

export default mongoose.model<IPortfolioProject>("Portfolio", PortfolioSchema);
