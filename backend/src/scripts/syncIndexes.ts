/**
 * Brings MongoDB indexes in line with the Mongoose schemas (creates missing,
 * drops ones no schema declares). Idempotent — a second run reports no changes.
 *
 * Run: npm run db:sync-indexes        (dev, ts-node)
 *      npm run db:sync-indexes:prod   (built image)
 */
import "dotenv/config";
import mongoose from "mongoose";
import "../models"; // registers every model

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(uri);
  try {
    let changes = 0;
    for (const name of mongoose.modelNames()) {
      const model = mongoose.model(name);
      const before = new Set((await model.collection.indexes().catch(() => [])).map((i) => i.name));
      const dropped = await model.syncIndexes();
      const after = new Set((await model.collection.indexes()).map((i) => i.name));
      const created = [...after].filter((n) => !before.has(n));
      if (created.length || dropped.length) {
        changes++;
        console.log(`${name}: created [${created.join(", ")}] dropped [${dropped.join(", ")}]`);
      }
    }
    console.log(changes ? `✅ Indexes synced (${changes} collection(s) changed)` : "✅ Indexes already in sync — no changes");
  } finally {
    await mongoose.disconnect();
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(`❌ Index sync failed: ${err.message}`);
    process.exit(1);
  }
);
