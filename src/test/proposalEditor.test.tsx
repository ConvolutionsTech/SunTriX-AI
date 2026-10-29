import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const apiRequest = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiRequest: (...args: unknown[]) => apiRequest(...args) };
});

import { ENDPOINTS } from "@/lib/api";
import { ProposalEditor } from "@/components/admin/ProposalEditor";

const props = { taskId: "t1", clientEmail: "ada@client.test", clientName: "Ada", onChanged: vi.fn() };
let proposals: unknown[] = [];

beforeEach(() => {
  proposals = [];
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (url: string) => {
    if (url === ENDPOINTS.PROPOSAL_ADMIN_BY_TASK("t1")) return { data: { proposals }, error: null, status: 200 };
    return { data: {}, error: null, status: 200 };
  });
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("ProposalEditor (A1, T-FE-6)", () => {
  it("edits in dollars and saves integer cents with a matching total", async () => {
    render(<ProposalEditor {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: "Write manually" }));

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Agent build" } });
    fireEvent.change(screen.getByLabelText("Milestone 1 title"), { target: { value: "Discovery" } });
    fireEvent.change(screen.getByLabelText("Milestone 1 amount in dollars"), { target: { value: "1500.50" } });
    fireEvent.click(screen.getByRole("button", { name: /add milestone/i }));
    fireEvent.change(screen.getByLabelText("Milestone 2 title"), { target: { value: "Build" } });
    fireEvent.change(screen.getByLabelText("Milestone 2 amount in dollars"), { target: { value: "3499.50" } });
    expect(screen.getByText("Total: $5,000.00")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(ENDPOINTS.PROPOSAL_ADMIN_CREATE, expect.anything()));
    const body = apiRequest.mock.calls.find(([url]) => url === ENDPOINTS.PROPOSAL_ADMIN_CREATE)![1].body;
    expect(body.milestones.map((m: { amount: number }) => m.amount)).toEqual([150_050, 349_950]);
    expect(body.totalAmount).toBe(500_000);
  });

  it("sends a saved draft to the client", async () => {
    proposals = [{ _id: "p1", title: "Agent build", status: "draft", totalAmount: 500_000, currency: "usd", expiresAt: "2026-12-01", milestones: [] }];
    render(<ProposalEditor {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: /send to client/i }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(ENDPOINTS.PROPOSAL_ADMIN_SEND("p1"), { method: "POST" }));
    expect(screen.getByText("Value: $5,000.00")).toBeInTheDocument();
  });

  it("shows the client's change request and pre-fills a revision in dollars", async () => {
    proposals = [{
      _id: "p1", title: "Agent build", status: "changes_requested", clientNote: "Split phase two", totalAmount: 500_000,
      currency: "usd", expiresAt: "2026-12-01", milestones: [{ title: "All", amount: 500_000, dueWeek: 4 }],
    }];
    render(<ProposalEditor {...props} />);
    expect(await screen.findByText(/Split phase two/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Revise proposal" }));
    expect(screen.getByLabelText("Milestone 1 amount in dollars")).toHaveValue("5000");
  });

  it("AI drafts (cents) appear as dollars in the form", async () => {
    apiRequest.mockImplementation(async (url: string) => {
      if (url === ENDPOINTS.PROPOSAL_ADMIN_BY_TASK("t1")) return { data: { proposals: [] }, error: null, status: 200 };
      if (url === ENDPOINTS.PROPOSAL_ADMIN_AI_DRAFT) {
        return { data: { draft: { title: "Draft", milestones: [{ title: "Phase 1", amount: 150_000, dueWeek: 2 }] } }, error: null, status: 200 };
      }
      return { data: {}, error: null, status: 200 };
    });
    render(<ProposalEditor {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: /draft with ai/i }));
    expect(await screen.findByLabelText("Milestone 1 amount in dollars")).toHaveValue("1500");
  });
});
