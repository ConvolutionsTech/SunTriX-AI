import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "@sentry/react";
import { scrubUrl } from "@/lib/monitoring";
import { AppErrorFallback } from "@/components/AppErrorFallback";

describe("client error monitoring (T-OPB-10)", () => {
  it("strips capability tokens from URLs", () => {
    expect(scrubUrl("https://suntrix.ai/proposal/prop_abc")).toBe("https://suntrix.ai/proposal/:token");
    expect(scrubUrl("/invoice/inv_abc?x=1")).toBe("/invoice/:token?x=1");
    expect(scrubUrl("/track/trk_abc#top")).toBe("/track/:token#top");
    expect(scrubUrl("/admin/reset-password/r123")).toBe("/admin/reset-password/:token");
    expect(scrubUrl("/payment/success?token=abc")).toBe("/payment/success?token=[redacted]");
    expect(scrubUrl("/blog/my-post")).toBe("/blog/my-post");
  });

  it("a render crash shows a recoverable fallback instead of a blank page", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const Boom = () => {
      throw new Error("boom");
    };
    render(
      <ErrorBoundary fallback={<AppErrorFallback />}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
    expect(screen.getByRole("button", { name: "Reload page" })).toBeInTheDocument();
  });
});
