import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Most backend tests are HTTP + database integration tests with bcrypt-hashed logins
    testTimeout: 30_000,
    include: ["src/test/**/*.test.ts"],
    // Absolute path: a relative "./src/test/setup.ts" resolves to the frontend's
    // file of the same name at the repo root.
    setupFiles: [path.resolve(__dirname, "src/test/setup.ts")],
    // `npm run test:coverage` (CI): the ops-critical code must stay ≥ 80 % covered
    coverage: {
      provider: "v8",
      reporter: ["text-summary"],
      include: [
        "src/middleware/**", "src/lib/**", "src/modules/**",
        "src/routes/newsletter.routes.ts", "src/routes/tracker.routes.ts", "src/routes/upload.routes.ts",
      ],
      thresholds: { lines: 80, functions: 80, statements: 80 },
    },
  },
});
