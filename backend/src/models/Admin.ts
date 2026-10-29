import mongoose, { Schema, Document } from "mongoose";
import bcrypt from "bcryptjs";

export interface IAdmin extends Document {
  email: string;
  password: string;
  name: string;
  role: "admin" | "viewer";
  /** Bumped to revoke every access and refresh token issued before it */
  tokenVersion: number;
  /** Live refresh-token sessions; rotatedAt marks a token already exchanged */
  refreshTokens: { jti: string; expiresAt: Date; rotatedAt?: Date }[];
  passwordChangedAt?: Date;
  /** sha256 of the single-use password reset token */
  passwordResetHash?: string;
  passwordResetExpires?: Date;
  createdAt: Date;
  comparePassword(plain: string): Promise<boolean>;
}

const AdminSchema = new Schema<IAdmin>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 12 },
    name: { type: String, required: true, trim: true },
    role: { type: String, enum: ["admin", "viewer"], default: "admin" },
    tokenVersion: { type: Number, default: 0 },
    refreshTokens: [
      {
        _id: false,
        jti: { type: String, required: true },
        expiresAt: { type: Date, required: true },
        rotatedAt: { type: Date },
      },
    ],
    passwordChangedAt: { type: Date },
    passwordResetHash: { type: String, index: true, sparse: true },
    passwordResetExpires: { type: Date },
  },
  { timestamps: true }
);

AdminSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

AdminSchema.methods.comparePassword = async function (plain: string): Promise<boolean> {
  return bcrypt.compare(plain, this.password);
};

// Never send password in JSON responses
// eslint-disable-next-line @typescript-eslint/no-explicit-any
AdminSchema.set("toJSON", {
  transform: function (_doc: unknown, ret: any) {
    delete ret.password;
    delete ret.refreshTokens;
    delete ret.passwordResetHash;
    delete ret.passwordResetExpires;
    return ret;
  },
} as any);

export default mongoose.model<IAdmin>("Admin", AdminSchema);
