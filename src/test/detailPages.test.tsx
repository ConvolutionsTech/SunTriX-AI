import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const apiRequest = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiRequest: (...args: unknown[]) => apiRequest(...args) };
});
vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return { ...actual, apiRequest: (...args: unknown[]) => apiRequest(...args) };
});

import { ENDPOINTS } from "@/lib/api";
import BlogDetail from "@/pages/BlogDetail";
import PortfolioDetail from "@/pages/PortfolioDetail";

const post = (slug: string, title: string) => ({ _id: slug, slug, title, content: `Body of ${title}`, status: "published", category: "AI", tags: [], createdAt: "2026-10-01" });

let goTo: (path: string) => void = () => {};
const Nav = () => {
  goTo = useNavigate();
  return null;
};

const renderAt = (path: string) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Nav />
        <Routes>
          <Route path="/blog/:slug" element={<BlogDetail />} />
          <Route path="/blog" element={<p>Blog index</p>} />
          <Route path="/work/:slug" element={<PortfolioDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockResolvedValue({ data: null, error: null, status: 200 });
});

describe("detail pages (T-FE-16)", () => {
  it("a slow response for an article the reader left never replaces the current one", async () => {
    let releaseFirst: (v: unknown) => void = () => {};
    apiRequest.mockImplementation((url: string) => {
      if (url === ENDPOINTS.BLOG_BY_SLUG("first")) return new Promise((r) => (releaseFirst = r));
      if (url === ENDPOINTS.BLOG_BY_SLUG("second")) return Promise.resolve({ data: post("second", "Second article"), error: null, status: 200 });
      return Promise.resolve({ data: { posts: [] }, error: null, status: 200 });
    });
    renderAt("/blog/first");
    goTo("/blog/second");
    expect(await screen.findAllByText("Second article")).not.toHaveLength(0);
    releaseFirst({ data: post("first", "First article"), error: null, status: 200 });
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("First article")).toBeNull();
  });

  it("a server error offers a retry instead of leaving the page; a 404 goes back to the blog", async () => {
    apiRequest.mockImplementation((url: string) =>
      Promise.resolve(url === ENDPOINTS.BLOG_BY_SLUG("flaky") ? { data: null, error: "The server ran into a problem.", status: 500 } : { data: null, error: null, status: 200 })
    );
    renderAt("/blog/flaky");
    expect(await screen.findByRole("alert")).toHaveTextContent("The server ran into a problem.");
    apiRequest.mockImplementation((url: string) =>
      Promise.resolve(url === ENDPOINTS.BLOG_BY_SLUG("flaky") ? { data: post("flaky", "Back online"), error: null, status: 200 } : { data: { posts: [] }, error: null, status: 200 })
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findAllByText("Back online")).not.toHaveLength(0);
  });

  it("an unknown article redirects to the blog index", async () => {
    apiRequest.mockImplementation((url: string) =>
      Promise.resolve(url === ENDPOINTS.BLOG_BY_SLUG("missing") ? { data: null, error: "Post not found", status: 404 } : { data: null, error: null, status: 200 })
    );
    renderAt("/blog/missing");
    expect(await screen.findByText("Blog index")).toBeInTheDocument();
  });

  it("a portfolio server error is retryable, a missing project says not found", async () => {
    apiRequest.mockImplementation((url: string) =>
      Promise.resolve(url === ENDPOINTS.PORTFOLIO_BY_SLUG("x") ? { data: null, error: "Network error", status: 0 } : { data: null, error: null, status: 200 })
    );
    const { unmount } = renderAt("/work/x");
    expect(await screen.findByRole("alert")).toHaveTextContent("Network error");
    unmount();
    apiRequest.mockImplementation((url: string) =>
      Promise.resolve(url === ENDPOINTS.PORTFOLIO_BY_SLUG("y") ? { data: null, error: "Not found", status: 404 } : { data: null, error: null, status: 200 })
    );
    renderAt("/work/y");
    await waitFor(() => expect(screen.getByText("Project Not Found")).toBeInTheDocument());
  });
});
