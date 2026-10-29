import { Router, Response, NextFunction } from "express";
import Admin from "../models/Admin";
import { requireAuth, requireAdmin, AuthRequest } from "../middleware/auth";
import { createError } from "../middleware/errorHandler";
import { validate, AdminUserCreateSchema, AdminUserUpdateSchema } from "../middleware/validate";
import { revokeAllSessions } from "../lib/tokens";
import { logAudit } from "../lib/audit";

/** Admin user management — admins only. There must always be at least one admin. */
const router = Router();

const view = (a: { _id: unknown; email: string; name: string; role: string; createdAt?: Date; passwordChangedAt?: Date }) => ({
  id: a._id,
  email: a.email,
  name: a.name,
  role: a.role,
  createdAt: a.createdAt,
  passwordChangedAt: a.passwordChangedAt,
});

async function isLastAdmin(id: string): Promise<boolean> {
  const others = await Admin.countDocuments({ role: "admin", _id: { $ne: id } });
  return others === 0;
}

// GET /admin/users
router.get("/", requireAuth, requireAdmin, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const admins = await Admin.find().sort({ createdAt: 1 }).lean();
    res.json({ users: admins.map(view) });
  } catch (err) {
    next(err);
  }
});

// POST /admin/users
router.post("/", requireAuth, requireAdmin, validate(AdminUserCreateSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (await Admin.exists({ email: req.body.email })) return next(createError("An admin with that email already exists", 409));
    const admin = await Admin.create(req.body);
    await logAudit(req, "create", "admin", String(admin._id), `${admin.email} (${admin.role})`);
    res.status(201).json({ user: view(admin) });
  } catch (err) {
    next(err);
  }
});

// PATCH /admin/users/:id — rename or change role; a role change signs the user out everywhere
router.patch("/:id", requireAuth, requireAdmin, validate(AdminUserUpdateSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const admin = await Admin.findById(req.params.id);
    if (!admin) return next(createError("User not found", 404));

    const { name, role } = req.body as { name?: string; role?: "admin" | "viewer" };
    const roleChanged = role !== undefined && role !== admin.role;
    if (roleChanged && admin.role === "admin" && (await isLastAdmin(req.params.id))) {
      return next(createError("Cannot demote the last admin", 409));
    }

    if (name !== undefined) admin.name = name;
    if (role !== undefined) admin.role = role;
    await admin.save();
    if (roleChanged) await revokeAllSessions(req.params.id);

    await logAudit(req, "update", "admin", req.params.id, admin.email, { name, role });
    res.json({ user: view(admin) });
  } catch (err) {
    next(err);
  }
});

// DELETE /admin/users/:id
router.delete("/:id", requireAuth, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.params.id === req.user!.id) return next(createError("You cannot delete your own account", 409));
    const admin = await Admin.findById(req.params.id);
    if (!admin) return next(createError("User not found", 404));
    if (admin.role === "admin" && (await isLastAdmin(req.params.id))) {
      return next(createError("Cannot delete the last admin", 409));
    }

    await admin.deleteOne();
    await revokeAllSessions(req.params.id);
    await logAudit(req, "delete", "admin", req.params.id, admin.email);
    res.json({ message: "User deleted" });
  } catch (err) {
    next(err);
  }
});

export default router;
