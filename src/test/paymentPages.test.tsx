import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const apiRequest = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiRequest: (...args: unknown[]) => apiRequest(...args) };
});

import { ENDPOINTS } from "@/lib/api";
import ClientInvoice from "@/pages/ClientInvoice";
import PaymentSuccess from "@/pages/PaymentSuccess";

const invoice = (overrides: object = {}) => ({
  _id: "p1", clientName: "Ada", clientEmail: "ada@client.test", description: "Deposit", amount: 250_000, currency: "usd",
  status: "pending", type: "invoice", expiresAt: new Date(Date.now() + 10 * 86_400_000).toISOString(), createdAt: "2026-10-01", ...overrides,
});

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/invoice/:token" element={<ClientInvoice />} />
          <Route path="/payment/success" element={<PaymentSuccess />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const assign = vi.fn();
beforeEach(() => {
  apiRequest.mockReset();
  assign.mockReset();
  vi.stubGlobal("location", { ...window.location, assign });
});
afterEach(() => vi.unstubAllGlobals());

describe("client invoice page (A4, N-FE-9)", () => {
  it("a pending invoice creates checkout on click (once) and redirects to Stripe", async () => {
    apiRequest.mockImplementation(async (url: string) =>
      url === ENDPOINTS.PAYMENT_INVOICE_CHECKOUT("inv1")
        ? { data: { checkoutUrl: "https://checkout.stripe.test/cs_1" }, error: null, status: 200 }
        : { data: invoice(), error: null, status: 200 }
    );
    renderAt("/invoice/inv1");
    const pay = await screen.findByRole("button", { name: /pay \$2,500\.00/i });
    fireEvent.click(pay);
    fireEvent.click(pay);
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://checkout.stripe.test/cs_1"));
    expect(apiRequest.mock.calls.filter(([url]) => url === ENDPOINTS.PAYMENT_INVOICE_CHECKOUT("inv1"))).toHaveLength(1);
  });

  it("a paid invoice shows as paid with no pay button", async () => {
    apiRequest.mockResolvedValue({ data: invoice({ status: "paid", trackingToken: "trk" }), error: null, status: 200 });
    renderAt("/invoice/inv1");
    expect(await screen.findByText(/Invoice Paid/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^pay/i })).toBeNull();
  });

  it.each([
    [{ status: "cancelled" }, "This invoice was cancelled."],
    [{ status: "pending", expiresAt: new Date(Date.now() - 86_400_000).toISOString() }, "This invoice has expired."],
  ])("explains why it can't be paid: %j", async (overrides, message) => {
    apiRequest.mockResolvedValue({ data: invoice(overrides), error: null, status: 200 });
    renderAt("/invoice/inv1");
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^pay/i })).toBeNull();
  });
});

describe("payment success page (A4)", () => {
  it("confirms once the invoice is recorded as paid", async () => {
    apiRequest.mockResolvedValue({ data: invoice({ status: "paid", paidAt: "2026-10-29T10:00:00Z" }), error: null, status: 200 });
    renderAt("/payment/success?session_id=cs_1&invoiceToken=inv1");
    expect(await screen.findByText("Payment Confirmed!")).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith(ENDPOINTS.PAYMENT_INVOICE("inv1"));
  });

  it("without an invoice token shows a neutral pending state, never an error", async () => {
    renderAt("/payment/success?session_id=cs_1");
    expect(await screen.findByText(/confirmation pending/i)).toBeInTheDocument();
    expect(screen.queryByText(/could not verify/i)).toBeNull();
  });
});
