import mongoose, { Schema, Document, Types } from "mongoose";

export interface ITrackerMessage extends Document {
  trackerId: Types.ObjectId;
  sender: "Admin" | "Client";
  text: string;
  sentAt: Date;
  readByClient: boolean;
  readByAdmin: boolean;
}

const TrackerMessageSchema = new Schema<ITrackerMessage>(
  {
    trackerId: { type: Schema.Types.ObjectId, ref: "ProjectTracker", required: true },
    sender: { type: String, enum: ["Admin", "Client"], required: true },
    text: { type: String, required: true },
    sentAt: { type: Date, default: Date.now },
    readByClient: { type: Boolean, default: false },
    readByAdmin: { type: Boolean, default: true },
  },
  { timestamps: false }
);

TrackerMessageSchema.index({ trackerId: 1, sentAt: 1 });

export default mongoose.model<ITrackerMessage>("TrackerMessage", TrackerMessageSchema);
