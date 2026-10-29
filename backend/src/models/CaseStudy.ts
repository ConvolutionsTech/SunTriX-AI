import mongoose, { Schema, Document } from "mongoose";

export interface ICaseStudy extends Document {
  projectId: mongoose.Types.ObjectId;
  slug: string;
  title: string;
  heroImage: string;
  challenge: string;
  solution: string;
  results: string;
  galleryImages: string[];
  videoUrl: string;
  toolsUsed: { name: string; icon: string }[];
  keyMetrics: { label: string; value: string; description: string }[];
  testimonial: { quote: string; name: string; role: string; avatar: string };
  status: "published" | "draft";
  createdAt: Date;
  updatedAt: Date;
}

const CaseStudySchema = new Schema<ICaseStudy>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Portfolio", required: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    title: { type: String, default: "" },
    heroImage: { type: String, default: "" },
    challenge: { type: String, default: "" },
    solution: { type: String, default: "" },
    results: { type: String, default: "" },
    galleryImages: [{ type: String }],
    videoUrl: { type: String, default: "" },
    toolsUsed: [{ name: String, icon: String }],
    keyMetrics: [{ label: String, value: String, description: String }],
    testimonial: {
      quote: { type: String, default: "" },
      name: { type: String, default: "" },
      role: { type: String, default: "" },
      avatar: { type: String, default: "" },
    },
    status: { type: String, enum: ["published", "draft"], default: "draft" },
  },
  { timestamps: true }
);

CaseStudySchema.index({ projectId: 1 });

CaseStudySchema.index({ status: 1, createdAt: -1 });

export default mongoose.model<ICaseStudy>("CaseStudy", CaseStudySchema);
