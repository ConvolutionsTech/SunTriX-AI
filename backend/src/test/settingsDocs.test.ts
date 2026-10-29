import { describe, it, expect } from "vitest";
import fs from "fs";
import { renderSettingsDoc, currentSettingsBlock, DOC_PATH, ENV_DOCS } from "../scripts/docsSettings";
import { isEnvOnlySetting } from "../lib/configLoader";
import { EnvSchema } from "../config/env";

describe("configuration reference (T-OPA-15)", () => {
  it("PlatformDocumentation.md matches the code — run `npm run docs:settings` if this fails", () => {
    expect(currentSettingsBlock(fs.readFileSync(DOC_PATH, "utf8"))).toBe(renderSettingsDoc());
  });

  it("every validated env key is documented and env-only", () => {
    const documented = new Set(ENV_DOCS.map(([k]) => k));
    for (const key of Object.keys(EnvSchema.shape ?? {})) {
      expect(documented.has(key), `${key} missing from ENV_DOCS`).toBe(true);
    }
    for (const [key] of ENV_DOCS.filter(([k]) => !k.includes("/") && k !== "JWT_EXPIRY")) {
      expect(isEnvOnlySetting(key), `${key} should be env-only`).toBe(true);
    }
  });
});
