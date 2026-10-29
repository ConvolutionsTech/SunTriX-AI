import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const apiRequest = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiRequest: (...args: unknown[]) => apiRequest(...args) };
});

import { AiUsageCard } from "@/components/admin/AiUsageCard";

describe("AiUsageCard (T-OPA-11)", () => {
  it("shows today's usage against the budget and the weekly total", async () => {
    apiRequest.mockResolvedValue({
      data: { budget: 1000, usedToday: 950, days: [{ day: "2026-10-28", operation: "chat", calls: 3, failed: 0, tokens: 400 }, { day: "2026-10-29", operation: "chat", calls: 5, failed: 1, tokens: 950 }] },
      error: null,
    });
    render(<AiUsageCard />);
    expect(await screen.findByText(/of 1,000 tokens \(95%\)/)).toBeInTheDocument();
    expect(screen.getByText("Last 7 days: 1,350 tokens across 8 calls")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "95");
  });
});
