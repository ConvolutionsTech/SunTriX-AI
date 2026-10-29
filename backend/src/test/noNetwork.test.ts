import { describe, it, expect } from "vitest";
import https from "https";

describe("tests never reach real services (T-OPB-20)", () => {
  it("blocks fetch and https to third-party hosts", async () => {
    await expect(fetch("https://api.groq.com/openai/v1/models")).rejects.toThrow(/mock the adapter/);
    expect(() => https.request("https://api.stripe.com/v1/charges")).toThrow(/mock the adapter/);
    expect(() => https.get({ hostname: "api.resend.com", path: "/" })).toThrow(/mock the adapter/);
  });
});
