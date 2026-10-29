import crypto from "crypto";
import mongoose, { Schema, Document } from "mongoose";

export const newUnsubscribeToken = () => crypto.randomBytes(32).toString("base64url");

export interface INewsletter extends Document {
  name: string;
  email: string;
  interest: string;
  subscribed: boolean;
  // Double opt-in fields — only populated when NEWSLETTER_DOUBLE_OPTIN=true
  confirmToken?: string;        // random hex token sent in confirmation email
  confirmTokenExpiry?: Date;    // 24 hours from subscription time
  /** Secret for the one-click unsubscribe link in every campaign email */
  unsubscribeToken: string;
  createdAt: Date;
}

const NewsletterSchema = new Schema<INewsletter>(
  {
    name:      { type: String, required: true, trim: true },
    email:     { type: String, required: true, unique: true, lowercase: true, trim: true },
    interest:  { type: String, required: true, default: "General News" },
    subscribed: { type: Boolean, default: true },
    // Double opt-in support
    confirmToken:       { type: String, default: null, index: true, sparse: true },
    confirmTokenExpiry: { type: Date, default: null },
    unsubscribeToken:   { type: String, default: newUnsubscribeToken, index: true },
  },
  { timestamps: true }
);

NewsletterSchema.index({ subscribed: 1, createdAt: -1 });
// Unconfirmed sign-ups disappear once their confirmation link expires (confirmed subscribers are never touched)
NewsletterSchema.index({ confirmTokenExpiry: 1 }, { expireAfterSeconds: 0, partialFilterExpression: { subscribed: false, confirmTokenExpiry: { $type: "date" } } });

export default mongoose.model<INewsletter>("Newsletter", NewsletterSchema);
