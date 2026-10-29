import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const apiRequest = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiRequest: (...args: unknown[]) => apiRequest(...args) };
});

import { ENDPOINTS } from "@/lib/api";
import AdminNewsletter from "@/pages/admin/AdminNewsletter";

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (url: string) => {
    if (url === ENDPOINTS.NEWSLETTER_LIST) return { data: [], error: null };
    if (url === ENDPOINTS.CAMPAIGN_LIST) {
      return {
        data: {
          campaigns: [
            { _id: "c1", subject: "October news", targetAudience: "All", status: "partially_failed", recipientCount: 6, sentCount: 4, failedCount: 2, createdAt: "2026-10-01T00:00:00Z" },
            { _id: "c2", subject: "September news", targetAudience: "All", status: "sent", recipientCount: 3, sentCount: 3, createdAt: "2026-09-01T00:00:00Z" },
          ],
        },
        error: null,
      };
    }
    return { data: { message: "Retrying campaign for 2 subscriber(s)." }, error: null };
  });
});

describe("newsletter campaign history (T-OPA-7)", () => {
  it("shows partial delivery and retries only failed campaigns", async () => {
    render(<MemoryRouter><AdminNewsletter /></MemoryRouter>);
    fireEvent.click(await screen.findByText(/Broadcast History/));
    expect(await screen.findByText("4 / 6")).toBeInTheDocument();
    expect(screen.getByText("2 failed")).toBeInTheDocument();

    const buttons = screen.getAllByRole("button", { name: "Retry failed" });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(ENDPOINTS.CAMPAIGN_RETRY("c1"), { method: "POST" }));
  });
});
