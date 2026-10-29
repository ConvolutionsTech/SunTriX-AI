import { Request, Response, NextFunction } from "express";
import AuditLog, { AuditAction } from "../models/AuditLog";
import { logger } from "./logger";

interface AdminUser {
  id: string;
  name: string;
}

/**
 * Record an admin action. `req.user` is the actor; pass `actor` when there is
 * no session yet (e.g. sign-in). Never throws — auditing must not break a request.
 */
export async function logAudit(
  req: Request,
  action: AuditAction,
  entity: string,
  entityId: string,
  entityName: string,
  diff?: Record<string, unknown>,
  actor?: AdminUser
): Promise<void> {
  try {
    const admin = actor ?? (req as Request & { user?: AdminUser }).user;
    if (!admin) return;
    await AuditLog.create({
      action,
      entity,
      entityId: String(entityId ?? ""),
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

const METHOD_ACTION: Record<string, AuditAction> = { POST: "create", PUT: "update", PATCH: "update", DELETE: "delete" };

/**
 * Router-level audit for resources whose handlers don't call logAudit
 * themselves: every successful staff write is recorded once, after the
 * response, with the route pattern and params. Public (token) routes have no
 * req.user and are skipped. `withBody` adds the request body (small text
 * content only — never use it for uploads or secrets).
 */
export function auditWrites(entity: string, opts: { withBody?: boolean; action?: (req: Request) => AuditAction | undefined } = {}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const action = opts.action?.(req) ?? METHOD_ACTION[req.method];
    if (!action) return next();
    res.on("finish", () => {
      if (res.statusCode >= 400 || !(req as Request & { user?: AdminUser }).user) return;
      const params = { ...req.params };
      const entityId = params.id ?? params.publicId ?? params.page ?? Object.values(params)[0] ?? "";
      const name = `${req.method} ${req.baseUrl}${req.route?.path ?? ""}`;
      void logAudit(req, action, entity, entityId, name, {
        params,
        ...(opts.withBody && req.body && typeof req.body === "object" && { changes: req.body }),
      });
    });
    next();
  };
}
