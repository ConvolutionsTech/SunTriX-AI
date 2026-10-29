import mongoose from "mongoose";
import { logger } from "../lib/logger";

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 5000;

// ─── Startup summary ─────────────────────────────────────────────────────────
function logDatabaseInfo(): void {
  const conn = mongoose.connection;
  logger.info(`✅ MongoDB connected: ${conn.host}/${conn.name} — ${mongoose.modelNames().length} models registered`);
}

// ─── Connect ──────────────────────────────────────────────────────────────────
export async function connectDB(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not defined in environment variables");
  }

  // Database name is the path segment after the host (with or without a query string)
  const dbNameFromUri = uri.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^/?]+)/)?.[1] || "(not set — defaults to 'test')";
  logger.info(`🔌 Connecting to MongoDB (database: ${dbNameFromUri})…`);

  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
      // After all model imports have registered
      setImmediate(logDatabaseInfo);
      return;
    } catch (err) {
      attempt++;
      logger.error({ err, attempt }, "MongoDB connection attempt failed");
      if (attempt < MAX_RETRIES) {
        logger.info(`⏳ Retrying in ${RETRY_DELAY_MS / 1000}s...`);
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  }
  throw new Error(`Failed to connect to MongoDB after ${MAX_RETRIES} attempts`);
}

// ─── Event listeners ─────────────────────────────────────────────────────────
mongoose.connection.on("disconnected", () => {
  logger.warn("⚠️  MongoDB disconnected");
});

mongoose.connection.on("error", (err) => {
  logger.error({ err }, "MongoDB error");
});
