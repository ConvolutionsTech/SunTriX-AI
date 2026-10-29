import { Router, Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import Admin from "../models/Admin";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { createError } from "../middleware/errorHandler";
import { getSetting } from "../lib/configLoader";
import { validate, LoginSchema, RefreshTokenSchema } from "../middleware/validate";

const router = Router();

// bcrypt hash (cost 12, same as Admin passwords) compared against when the email is unknown
const TIMING_EQUALISER_HASH = "$2a$12$nlvWdtByaON4P.SkgUKqh.vuKPyXNAXEqObAh1rr4Ck361PYfguz2";

// POST /auth/login
router.post("/login", validate(LoginSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    // Zod validate() enforces email format and password length

    const admin = await Admin.findOne({ email: email.toLowerCase() });
    // Always run one bcrypt comparison so response time doesn't reveal which emails exist
    const isMatch = admin ? await admin.comparePassword(password) : await bcrypt.compare(password, TIMING_EQUALISER_HASH);
    if (!admin || !isMatch) {
      return next(createError("Invalid email or password", 401));
    }

    const secret = getSetting("JWT_SECRET");
    if (!secret) throw new Error("JWT_SECRET not configured. Set it in Admin → Settings → Security.");
    
    // Use dedicated refresh secret, fallback to derived secret for backward compatibility
    const refreshSecret = getSetting("JWT_REFRESH_SECRET", secret + "_refresh_token_salt");
    
    const expiresIn = getSetting("JWT_EXPIRY", "7d") as `${number}${"s"|"m"|"h"|"d"|"w"}`;
    const refreshExpiresIn = "30d"; // refresh tokens last 30 days

    
    const payload = { id: admin._id, email: admin.email, role: admin.role, name: admin.name };
    const token = jwt.sign(payload, secret, { expiresIn });
    const refreshToken = jwt.sign(payload, refreshSecret, { expiresIn: refreshExpiresIn });

    res.json({
      token,
      refreshToken,
      user: { id: admin._id, email: admin.email, name: admin.name, role: admin.role },
    });
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

// POST /auth/refresh — issue new tokens using a valid refresh token
router.post("/refresh", validate(RefreshTokenSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;
    // Zod validate() enforces refreshToken presence

    const secret = getSetting("JWT_SECRET");
    if (!secret) throw new Error("JWT_SECRET not configured. Set it in Admin → Settings → Security.");
    
    // Use dedicated refresh secret, fallback to derived secret for backward compatibility
    const refreshSecret = getSetting("JWT_REFRESH_SECRET", secret + "_refresh_token_salt");


    let decoded;
    try {
      decoded = jwt.verify(refreshToken, refreshSecret) as { id: string; email: string; role: string; name: string };
    } catch (err) {
      return next(createError("Invalid or expired refresh token", 401));
    }

    const admin = await Admin.findById(decoded.id).select("-password");
    if (!admin) return next(createError("User not found", 404));
    
    const expiresIn = getSetting("JWT_EXPIRY", "7d") as `${number}${"s"|"m"|"h"|"d"|"w"}`;
    const refreshExpiresIn = "30d";

    
    const payload = { id: admin._id, email: admin.email, role: admin.role, name: admin.name };
    const newToken = jwt.sign(payload, secret, { expiresIn });
    const newRefreshToken = jwt.sign(payload, refreshSecret, { expiresIn: refreshExpiresIn });

    res.json({ token: newToken, refreshToken: newRefreshToken });
  } catch (err) {
    next(err);
  }
});

// POST /auth/logout  (client-side token removal; server just acknowledges)
router.post("/logout", requireAuth, (_req: Request, res: Response) => {
  res.json({ message: "Logged out successfully" });
});

export default router;
