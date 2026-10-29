import crypto from "crypto";
import Admin from "../../models/Admin";
import { signAccessToken } from "../../lib/tokens";

/**
 * Creates a real admin user and returns a valid access token for it.
 * requireAuth checks the token version against the database, so tokens for
 * users that don't exist are rejected. Requires connectTestDb().
 */
export async function staffToken(role: "admin" | "viewer" = "admin"): Promise<string> {
  const admin = await Admin.create({
    email: `${role}-${crypto.randomBytes(4).toString("hex")}@suntrix.test`,
    password: "test-password-123",
    name: role,
    role,
  });
  return signAccessToken(admin);
}
