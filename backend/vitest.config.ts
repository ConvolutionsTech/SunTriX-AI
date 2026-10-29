import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/test/**/*.test.ts"],
    // Absolute path: a relative "./src/test/setup.ts" resolves to the frontend's
    // file of the same name at the repo root.
    setupFiles: [path.resolve(__dirname, "src/test/setup.ts")],
  },
});
