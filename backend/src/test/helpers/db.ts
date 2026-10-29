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
  if (uri) {
    if (/mongodb\+srv|atlas/i.test(uri) || !/_test/i.test(uri)) {
      throw new Error("MONGODB_TEST_URI must point at a local disposable database whose name contains '_test'");
    }
  } else {
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri("suntrix_test");
  }

  process.env.MONGODB_URI = uri;
  await mongoose.connect(uri);
  // Fresh database: build declared indexes so unique constraints are enforced
  await mongoose.connection.syncIndexes();
}

export async function clearTestDb(): Promise<void> {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
}

export async function disconnectTestDb(): Promise<void> {
  await mongoose.disconnect();
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}
