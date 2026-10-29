import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const apiRequest = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiRequest: (...args: unknown[]) => apiRequest(...args) };
});

import { ENDPOINTS } from "@/lib/api";
import ClientContract from "@/pages/ClientContract";

const contract = {
  _id: "c1", contractToken: "ctok", status: "pending", clientName: "Ada", clientEmail: "ada@client.test",
  projectTitle: "Agent build", fullContractText: "<p>Terms</p>", createdAt: "2026-10-01T00:00:00.000Z",
};

beforeEach(() => apiRequest.mockReset());

describe("client contract page (M8)", () => {
  it("after signing, links to the project hub using trackerToken", async () => {
    apiRequest.mockImplementation(async (url: string) => {
      if (url === ENDPOINTS.CONTRACT_BY_TOKEN("ctok")) return { data: contract, error: null, status: 200 };
      if (url === ENDPOINTS.CONTRACT_SIGN("ctok")) return { data: { trackerToken: "trk-123" }, error: null, status: 200 };
      return { data: null, error: null, status: 200 };
    });

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/contract/ctok"]}>
          <Routes>
            <Route path="/contract/:token" element={<ClientContract />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    fireEvent.change(await screen.findByPlaceholderText(/full name/i), { target: { value: "Ada Lovelace" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /sign/i }));

    const link = await screen.findByRole("link", { name: /project/i });
    expect(link).toHaveAttribute("href", "/client/project/trk-123");
    expect(apiRequest).toHaveBeenCalledWith(ENDPOINTS.CONTRACT_SIGN("ctok"), {
      method: "POST",
      body: { clientSignatureName: "Ada Lovelace", agreed: true },
    });
  });
});
