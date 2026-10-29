import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const apiRequest = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiRequest: (...args: unknown[]) => apiRequest(...args) };
});

import { ENDPOINTS } from "@/lib/api";
import AdminProjectHub from "@/components/admin/AdminProjectHub";

const tracker = {
  _id: "tr1", taskRequestId: "t1", trackerToken: "tok", currentPhase: "Discovery",
  phases: [{ name: "Discovery", enteredAt: "2026-10-01" }], deliverables: [], updates: [], files: [], messages: [], auditLog: [],
  milestones: [{ _id: "m1", title: "Discovery", amount: 150_000, dueDate: "2026-11-01", paymentRequestedAt: "2026-10-20" }],
};

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (url: string) => {
    if (url === ENDPOINTS.TRACKER_ADMIN_LIST) return { data: { trackers: [tracker] }, error: null, status: 200 };
    if (url === ENDPOINTS.TRACKER_ADMIN_BY_ID("tr1")) return { data: { tracker }, error: null, status: 200 };
    return { data: {}, error: null, status: 200 };
  });
});

describe("AdminProjectHub", () => {
  it("renders the tracker and records an off-platform payment", async () => {
    vi.spyOn(window, "prompt").mockReturnValue("Bank transfer #123");
    render(<AdminProjectHub taskId="t1" />);

    fireEvent.click(await screen.findByRole("button", { name: /milestones/i }));
    fireEvent.click(await screen.findByRole("button", { name: /paid outside stripe/i }));
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(ENDPOINTS.TRACKER_ADMIN_MILESTONE_PAID_MANUALLY("tr1", "m1"), {
        method: "POST",
        body: { note: "Bank transfer #123" },
      })
    );
  });
});
