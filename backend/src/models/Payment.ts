import mongoose, { Schema, Document, Types } from "mongoose";

export type PaymentType = "subscription" | "invoice" | "retainer";
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded" | "cancelled";

export interface IPayment extends Document {
  stripeSessionId: string;
  stripePaymentIntentId: string;
  stripeCustomerId: string;
  type: PaymentType;
  status: PaymentStatus;
  amount: number;          // in cents (e.g. 50000 = $500.00)
  currency: string;
  clientEmail: string;
  clientName: string;
  description: string;
  planId?: Types.ObjectId;
  taskRequestId?: Types.ObjectId;
  invoiceToken: string;
  trackingToken: string;   // links back to the TaskRequest tracker
  receiptUrl: string;      // Stripe hosted receipt URL
  expiresAt?: Date;        // invoice expiry (30 days from creation)
  sessionExpiresAt?: Date;
  checkoutLock?: Date | null;
  refundId: string;
  refundedAt?: Date;
  refundReason: string;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema = new Schema<IPayment>(
  {
    stripeSessionId:       { type: String, unique: true, sparse: true, index: true },
    stripePaymentIntentId: { type: String, default: "" },
    stripeCustomerId:      { type: String, default: "" },

    type:   { type: String, enum: ["subscription", "invoice", "retainer"], required: true },
    status: { type: String, enum: ["pending", "paid", "failed", "refunded", "cancelled"], default: "pending" },

    amount:   { type: Number, required: true }, // cents
    currency: { type: String, default: "usd" },

    clientEmail: { type: String, required: true, lowercase: true, trim: true },
    clientName:  { type: String, default: "" },
    description: { type: String, default: "" },

    planId:        { type: Schema.Types.ObjectId, ref: "Pricing", default: null },
    taskRequestId: { type: Schema.Types.ObjectId, ref: "TaskRequest", default: null },

    invoiceToken:  { type: String, unique: true, sparse: true, index: true },
    trackingToken: { type: String, default: "" },
    receiptUrl:    { type: String, default: "" },
    expiresAt:     { type: Date },
    // Open Stripe Checkout session for this invoice (reused instead of creating duplicates)
    sessionExpiresAt: { type: Date },
    // Short-lived lock while a checkout session is being created
    checkoutLock:     { type: Date, default: null },

    refundId:     { type: String, default: "" },
    refundedAt:   { type: Date },
    refundReason: { type: String, default: "" },

    paidAt: { type: Date },
  },
  { timestamps: true }
);

PaymentSchema.index({ clientEmail: 1 });
PaymentSchema.index({ status: 1, createdAt: -1 });
PaymentSchema.index({ taskRequestId: 1 });

export default mongoose.model<IPayment>("Payment", PaymentSchema);
