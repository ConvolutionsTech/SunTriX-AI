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
import NewsletterStatus from "@/pages/NewsletterStatus";

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/newsletter/confirm/:token" element={<NewsletterStatus mode="confirm" />} />
          <Route path="/newsletter/unsubscribe/:token" element={<NewsletterStatus mode="unsubscribe" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockResolvedValue({ data: { message: "Done." }, error: null });
});

describe("newsletter link pages", () => {
  it("confirms the subscription when the page opens", async () => {
    renderAt("/newsletter/confirm/abc");
    expect(await screen.findByText("Done.")).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith(ENDPOINTS.NEWSLETTER_CONFIRM("abc"));
  });

  it("only unsubscribes after a click (mail scanners open links)", async () => {
    renderAt("/newsletter/unsubscribe/tok");
    expect(apiRequest).not.toHaveBeenCalledWith(ENDPOINTS.NEWSLETTER_UNSUBSCRIBE("tok"), expect.anything());

    fireEvent.click(screen.getByRole("button", { name: "Unsubscribe" }));
    expect(await screen.findByText("Done.")).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith(ENDPOINTS.NEWSLETTER_UNSUBSCRIBE("tok"), { method: "POST" });
  });
});
