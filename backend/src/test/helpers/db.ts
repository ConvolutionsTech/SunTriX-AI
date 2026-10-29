import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

/**
 * Disposable test database.
 *
 * Uses MONGODB_TEST_URI when set (e.g. a throwaway Docker container in CI),
 * otherwise starts an in-memory mongod. Never connects to MONGODB_URI from .env.
 */
let memoryServer: MongoMemoryServer | null = null;

export async function connectTestDb(): Promise<void> {
  if (mongoose.connection.readyState === 1) return;

  let uri = process.env.MONGODB_TEST_URI;
  // Test files run in parallel; on a shared server each file gets its own
  // database so one file's cleanup can't delete another file's data.
  let dbName = "suntrix_test";
  if (uri) {
    if (/mongodb\+srv|atlas/i.test(uri) || !/_test/i.test(uri)) {
      throw new Error("MONGODB_TEST_URI must point at a local disposable database whose name contains '_test'");
    }
    dbName = `suntrix_test_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
  } else {
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri();
  }

  process.env.MONGODB_URI = uri;
  await mongoose.connect(uri, { dbName });
  // Fresh database: build declared indexes so unique constraints are enforced
  await mongoose.connection.syncIndexes();
}

export async function clearTestDb(): Promise<void> {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
}

export async function disconnectTestDb(): Promise<void> {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
  }
  await mongoose.disconnect();
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}
