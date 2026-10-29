import { Router, Request, Response, NextFunction } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import Admin from "../models/Admin";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { createError } from "../middleware/errorHandler";
import { getSetting } from "../lib/configLoader";
import { issueSession, rotateSession, revokeAllSessions } from "../lib/tokens";
import { logAudit } from "../lib/audit";
import { sendPasswordResetEmail } from "../services/email";
import {
  validate,
  LoginSchema,
  RefreshTokenSchema,
  ChangePasswordSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
} from "../middleware/validate";

const router = Router();

// bcrypt hash (cost 12, same as Admin passwords) compared against when the email is unknown
const TIMING_EQUALISER_HASH = "$2a$12$nlvWdtByaON4P.SkgUKqh.vuKPyXNAXEqObAh1rr4Ck361PYfguz2";
const RESET_TTL_MS = 30 * 60 * 1000;

const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const publicUser = (admin: { _id: unknown; email: string; name: string; role: string }) => ({
  id: admin._id,
  email: admin.email,
  name: admin.name,
  role: admin.role,
});

// POST /auth/login
router.post("/login", validate(LoginSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    const admin = await Admin.findOne({ email: email.toLowerCase() });
    // Always run one bcrypt comparison so response time doesn't reveal which emails exist
    const isMatch = admin ? await admin.comparePassword(password) : await bcrypt.compare(password, TIMING_EQUALISER_HASH);
    if (!admin || !isMatch) {
      // Not awaited: the response time must not depend on whether the email exists
      void logAudit(req, "login_failed", "admin", admin ? String(admin._id) : "", String(email).toLowerCase().slice(0, 254), { ip: req.ip }, { id: admin ? String(admin._id) : "unknown", name: "(sign-in attempt)" });
      return next(createError("Invalid email or password", 401));
    }

    const tokens = await issueSession(admin);
    void logAudit(req, "login", "admin", String(admin._id), admin.email, { ip: req.ip }, { id: String(admin._id), name: admin.name });
    res.json({ ...tokens, user: publicUser(admin) });
  } catch (err) {
    next(err);
  }
});

// GET /auth/me
router.get("/me", requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const admin = await Admin.findById(req.user!.id).select("-password");
    if (!admin) return next(createError("User not found", 404));
    res.json(admin);
  } catch (err) {
    next(err);
  }
});

// POST /auth/refresh — rotates the refresh token; reuse of an old one ends every session
router.post("/refresh", validate(RefreshTokenSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await rotateSession(req.body.refreshToken));
  } catch (err) {
    next(err);
  }
});

// POST /auth/logout — ends every session for this admin (access tokens stop working within 60 s)
router.post("/logout", requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await revokeAllSessions(req.user!.id);
    res.json({ message: "Logged out successfully" });
  } catch (err) {
    next(err);
  }
});

// POST /auth/password — change own password; other sessions are signed out
router.post("/password", requireAuth, validate(ChangePasswordSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const admin = await Admin.findById(req.user!.id);
    if (!admin || !(await admin.comparePassword(req.body.currentPassword))) {
      return next(createError("Current password is incorrect", 400));
    }

    admin.password = req.body.newPassword;
    admin.passwordChangedAt = new Date();
    await admin.save();
    await revokeAllSessions(String(admin._id));
    await logAudit(req, "update", "admin", String(admin._id), `${admin.email} (password changed)`);

    const fresh = await Admin.findById(admin._id);
    res.json({ message: "Password changed", ...(await issueSession(fresh!)) });
  } catch (err) {
    next(err);
  }
});

// POST /auth/forgot — always 200, so it can't be used to discover admin emails
router.post("/forgot", validate(ForgotPasswordSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const admin = await Admin.findOne({ email: req.body.email });
    if (admin) {
      const token = crypto.randomBytes(32).toString("base64url");
      admin.passwordResetHash = sha256(token);
      admin.passwordResetExpires = new Date(Date.now() + RESET_TTL_MS);
      await admin.save();

      const resetUrl = `${getSetting("FRONTEND_URL", "http://localhost:5173")}/admin/reset-password/${token}`;
      await sendPasswordResetEmail({ email: admin.email, name: admin.name, resetUrl });
    }
    res.json({ message: "If that email belongs to an admin, a reset link has been sent." });
  } catch (err) {
    next(err);
  }
});

// POST /auth/reset/:token — single use, 30 minutes; signs out every session
router.post("/reset/:token", validate(ResetPasswordSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const admin = await Admin.findOne({
      passwordResetHash: sha256(req.params.token),
      passwordResetExpires: { $gt: new Date() },
    });
    if (!admin) return next(createError("This reset link is invalid or has expired", 400));

    admin.password = req.body.password;
    admin.passwordChangedAt = new Date();
    admin.passwordResetHash = undefined;
    admin.passwordResetExpires = undefined;
    await admin.save();
    await revokeAllSessions(String(admin._id));

    res.json({ message: "Password reset. You can now sign in." });
  } catch (err) {
    next(err);
  }
});

export default router;
