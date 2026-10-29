import mongoose, { Schema } from "mongoose";

/**
 * One document (`_id: "settings"`) whose version goes up on every settings
 * change; each instance polls it and reloads its cache when it moves.
 */
interface ISettingsVersion {
  _id: string;
  version: number;
}

const SettingsVersionSchema = new Schema<ISettingsVersion>(
  { _id: { type: String }, version: { type: Number, default: 0 } },
  { timestamps: true, versionKey: false }
);

export default mongoose.model<ISettingsVersion>("SettingsVersion", SettingsVersionSchema);
