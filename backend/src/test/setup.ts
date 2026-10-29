/**
 * Test setup — runs before every test file.
 *
 * Tests must never touch a real database. Several tests (and app.ts) call
 * dotenv, which does not overwrite variables that are already set, so pinning
 * MONGODB_URI here keeps a production URI in backend/.env from being picked up.
 */
process.env.NODE_ENV = "test";

// Tests simulate distinct clients with X-Forwarded-For
process.env.TRUST_PROXY ||= "1";

// Deterministic signing key so tests that mint JWTs agree with requireAuth
process.env.JWT_SECRET ||= "test_jwt_secret_min_64_chars_long_key_string_for_testing_1234567890";
process.env.JWT_REFRESH_SECRET ||= "test_jwt_refresh_secret_different_from_access_0123456789abcdef";

const TEST_DB_DEFAULT = "mongodb://127.0.0.1:27017/suntrix_test";
const uri = process.env.MONGODB_URI;

if (!uri) {
  process.env.MONGODB_URI = TEST_DB_DEFAULT;
} else if (!/_test|memory/i.test(uri)) {
  throw new Error(
    `Refusing to run tests against MONGODB_URI="${uri.replace(/\/\/[^@]*@/, "//***@")}". ` +
      "Point it at a disposable database whose name contains '_test'."
  );
}

// Unknown fields throw in tests (see config/mongoose.ts); must load before any model
import "../config/mongoose";

// No test may reach a real third-party service: only local addresses (supertest,
// test MongoDB) and the mongodb-memory-server binary download are allowed.
import http from "http";
import https from "https";
const ALLOWED_HOSTS = /^(localhost|127\.0\.0\.1|::1|\[::1\]|0\.0\.0\.0|fastdl\.mongodb\.org|downloads\.mongodb\.org)$/i;
function hostOf(arg: unknown): string {
  if (typeof arg === "string") return new URL(arg).hostname;
  if (arg instanceof URL) return arg.hostname;
  const o = (arg ?? {}) as { hostname?: string; host?: string };
  return (o.hostname ?? o.host ?? "localhost").replace(/:\d+$/, "");
}
for (const mod of [http, https]) {
  for (const fn of ["request", "get"] as const) {
    const original = mod[fn] as (...args: unknown[]) => http.ClientRequest;
    (mod as unknown as Record<string, unknown>)[fn] = (...args: unknown[]) => {
      const host = hostOf(args[0]);
      if (!ALLOWED_HOSTS.test(host)) throw new Error(`Test tried to call ${host} — mock the adapter instead`);
      return original.apply(mod, args);
    };
  }
}
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  const url = typeof input === "string" || input instanceof URL ? String(input) : input.url;
  const host = new URL(url).hostname;
  if (!ALLOWED_HOSTS.test(host)) throw new Error(`Test tried to call ${host} — mock the adapter instead`);
  return realFetch(input, init);
}) as typeof fetch;
