import { Request } from "express";
import AuditLog, { AuditAction } from "../models/AuditLog";
import { logger } from "./logger";

interface AdminUser {
  id: string;
  name: string;
}

export async function logAudit(
  req: Request,
  action: AuditAction,
  entity: string,
  entityId: string,
  entityName: string,
  diff?: Record<string, unknown>
): Promise<void> {
  try {
    const admin = (req as Request & { user?: AdminUser }).user;
    if (!admin) return;
    await AuditLog.create({
      action,
      entity,
      entityId,
      entityName,
      adminId: admin.id,
      adminName: admin.name,
      diff,
    });
  } catch (err) {
    // Audit logging is non-fatal
    logger.error({ err }, "Audit log error");
  }
}
