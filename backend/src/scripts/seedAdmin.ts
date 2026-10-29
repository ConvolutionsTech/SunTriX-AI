/**
 * First-admin bootstrap (idempotent).
 *
 * Creates an admin from ADMIN_SEED_EMAIL / ADMIN_SEED_PASSWORD / ADMIN_SEED_NAME
 * if no admin with that email exists. Safe to run on every deploy.
 *
 * Run: npm run seed:admin        (dev, ts-node)
 *      npm run seed:admin:prod   (built image, node dist/)
 */
import "dotenv/config";
import mongoose from "mongoose";
import Admin from "../models/Admin";

export const MIN_ADMIN_PASSWORD_LENGTH = 12;
const WEAK_PASSWORDS = new Set(["admin123", "password", "changeme", "your_secure_password"]);

export interface SeedAdminInput {
  email?: string;
  password?: string;
  name?: string;
}

export async function seedAdmin(input: SeedAdminInput): Promise<{ created: boolean; email: string }> {
  const email = input.email?.trim().toLowerCase();
  const password = input.password ?? "";
  const name = input.name?.trim() || "Admin";

  if (!email) throw new Error("ADMIN_SEED_EMAIL is required");
  if (password.length < MIN_ADMIN_PASSWORD_LENGTH) {
    throw new Error(`ADMIN_SEED_PASSWORD must be at least ${MIN_ADMIN_PASSWORD_LENGTH} characters`);
  }
  if (WEAK_PASSWORDS.has(password.toLowerCase())) {
    throw new Error("ADMIN_SEED_PASSWORD is a known weak password");
  }

  const existing = await Admin.findOne({ email });
  if (existing) return { created: false, email };

  await Admin.create({ email, password, name, role: "admin" });
  return { created: true, email };
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");

  await mongoose.connect(uri);
  try {
    const result = await seedAdmin({
      email: process.env.ADMIN_SEED_EMAIL,
      password: process.env.ADMIN_SEED_PASSWORD,
      name: process.env.ADMIN_SEED_NAME,
    });
    console.log(result.created ? `✅ Admin created: ${result.email}` : `⏭️  Admin already exists: ${result.email}`);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(`❌ Admin seed failed: ${err.message}`);
      process.exit(1);
    });
}
