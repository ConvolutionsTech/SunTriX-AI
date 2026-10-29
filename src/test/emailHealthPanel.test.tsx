import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const apiRequest = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiRequest: (...args: unknown[]) => apiRequest(...args) };
});

import { ENDPOINTS } from "@/lib/api";
import { EmailHealthPanel } from "@/components/admin/EmailHealthPanel";

beforeEach(() => {
  apiRequest.mockReset();
});

describe("EmailHealthPanel (T-OPA-8)", () => {
  it("renders nothing when email works", () => {
    const { container } = render(<EmailHealthPanel health={{ configured: true, failedLast7Days: 0 }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("warns when email is not configured", () => {
    render(<EmailHealthPanel health={{ configured: false, failedLast7Days: 0 }} />);
    expect(screen.getByText("Email is not configured")).toBeInTheDocument();
  });

  it("lists failed emails and retries one", async () => {
    apiRequest.mockImplementation(async (url: string) => {
      if (url === ENDPOINTS.ADMIN_EMAIL_LOG("failed")) {
        return { data: { logs: [{ _id: "e1", template: "invoiceEmail", to: ["ada@client.test"], subject: "Invoice", error: "502", attempts: 5, createdAt: "2026-10-01T00:00:00Z" }] }, error: null };
      }
      return { data: {}, error: null };
    });
    const onChanged = vi.fn();
    render(<EmailHealthPanel health={{ configured: true, failedLast7Days: 1 }} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole("button", { name: "Show failed emails" }));
    expect(await screen.findByText("Invoice")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(ENDPOINTS.ADMIN_EMAIL_RETRY("e1"), { method: "POST" }));
    expect(await screen.findByText("No failed emails left.")).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
  });
});
