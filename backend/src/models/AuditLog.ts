import mongoose, { Schema, Document } from "mongoose";

export type AuditAction = "create" | "update" | "delete" | "publish" | "login" | "bulk_delete" | "bulk_update" | "status_change" | "broadcast" | "reorder" | "bulk_import" | "reply";

export interface IAuditLog extends Document {
  action: AuditAction;
  entity: string;
  entityId: string;
  entityName: string;
  adminId: string;
  adminName: string;
  diff?: Record<string, unknown>;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    action: {
      type: String,
      enum: ["create", "update", "delete", "publish", "login", "bulk_delete", "bulk_update", "status_change", "broadcast", "reorder", "bulk_import", "reply"],
      required: true,
    },
    entity: { type: String, required: true },
    entityId: { type: String, default: "" },
    entityName: { type: String, default: "" },
    adminId: { type: String, required: true },
    adminName: { type: String, required: true },
    diff: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

AuditLogSchema.index({ entity: 1, createdAt: -1 });
AuditLogSchema.index({ adminId: 1 });
AuditLogSchema.index({ action: 1 });

AuditLogSchema.index({ createdAt: 1 }); // retention cleanup (lib/scheduler.ts)

export default mongoose.model<IAuditLog>("AuditLog", AuditLogSchema);
