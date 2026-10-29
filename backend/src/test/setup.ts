/**
 * Test setup — runs before every test file.
 *
 * Tests must never touch a real database. Several tests (and app.ts) call
 * dotenv, which does not overwrite variables that are already set, so pinning
 * MONGODB_URI here keeps a production URI in backend/.env from being picked up.
 */
process.env.NODE_ENV = "test";

// Deterministic signing key so tests that mint JWTs agree with requireAuth
process.env.JWT_SECRET ||= "test_jwt_secret_min_64_chars_long_key_string_for_testing_1234567890";

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
