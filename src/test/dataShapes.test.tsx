import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, renderHook, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// Quill does not run in jsdom; a textarea is enough to observe the editor's value
vi.mock("react-quill", () => ({
  default: React.forwardRef<HTMLTextAreaElement, { value?: string; onChange?: (v: string) => void }>(
    ({ value, onChange }, ref) => (
      <textarea ref={ref} data-testid="editor" value={value ?? ""} onChange={(e) => onChange?.(e.target.value)} />
    )
  ),
}));

const apiRequest = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiRequest: (...args: unknown[]) => apiRequest(...args) };
});

import { ENDPOINTS } from "@/lib/api";
import { useCompanyInfo } from "@/hooks/useCompanyInfo";
import AdminBlog from "@/pages/admin/AdminBlog";
import TrackRequest from "@/pages/TrackRequest";

function withProviders(ui: React.ReactNode, path = "/") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  apiRequest.mockReset();
});

describe("useCompanyInfo (N-FE-2)", () => {
  it("reads the flat /cms/company response", async () => {
    apiRequest.mockResolvedValue({ data: { name: "Acme AI", email: "hi@acme.test" }, error: null });
    const { result } = renderHook(() => useCompanyInfo(), { wrapper: ({ children }) => withProviders(children) });
    await waitFor(() => expect(result.current.name).toBe("Acme AI"));
    expect(result.current.email).toBe("hi@acme.test");
    expect(apiRequest).toHaveBeenCalledWith(ENDPOINTS.CMS_COMPANY);
  });
});

describe("AdminBlog (N-RUN-2, N-FE-13)", () => {
  const listItem = {
    _id: "p1", title: "Hello World", slug: "hello-world", excerpt: "Intro", tags: ["ai"], category: "AI",
    status: "published", createdAt: "2026-10-01T00:00:00.000Z",
  };

  beforeEach(() => {
    apiRequest.mockImplementation(async (url: string) => {
      if (url === ENDPOINTS.BLOG_BY_ID("p1")) return { data: { ...listItem, content: "<p>Full article body</p>" }, error: null };
      if (url.startsWith(ENDPOINTS.BLOG_LIST)) return { data: { posts: [listItem] }, error: null }; // list omits content
      return { data: null, error: null };
    });
  });

  it("opens the editor from the header buttons without crashing", async () => {
    render(withProviders(<AdminBlog />));
    fireEvent.click(await screen.findByRole("button", { name: /Write Post/ }));
    expect(await screen.findByTestId("editor")).toHaveValue("");
  });

  it("loads the full post before editing so the body is not wiped", async () => {
    render(withProviders(<AdminBlog />));
    fireEvent.click(await screen.findByRole("button", { name: "Edit post" }));
    await waitFor(() => expect(screen.getByTestId("editor")).toHaveValue("<p>Full article body</p>"));
    expect(apiRequest).toHaveBeenCalledWith(ENDPOINTS.BLOG_BY_ID("p1"));
  });
});

describe("TrackRequest timeline (N-FE-4)", () => {
  it("renders the client-safe statusTimeline", async () => {
    apiRequest.mockImplementation(async (url: string) => {
      if (url === ENDPOINTS.TASK_REQUEST_TRACK("tok123")) {
        return {
          data: {
            name: "Ada", projectTitle: "Agent build", service: "AI", status: "in_review",
            createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-02T00:00:00.000Z",
            statusTimeline: [
              { status: "new", updatedAt: "2026-10-01T00:00:00.000Z" },
              { status: "in_review", updatedAt: "2026-10-02T00:00:00.000Z" },
            ],
          },
          error: null,
        };
      }
      return { data: null, error: null };
    });
    render(withProviders(<Routes><Route path="/track/:token" element={<TrackRequest />} /></Routes>, "/track/tok123"));
    expect(await screen.findByText("Updates")).toBeInTheDocument();
  });
});
