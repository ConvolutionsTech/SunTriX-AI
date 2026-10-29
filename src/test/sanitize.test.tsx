import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { sanitizeHtml, safeHref } from "@/lib/sanitize";

const apiRequest = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiRequest: (...args: unknown[]) => apiRequest(...args) };
});

import BlogDetail from "@/pages/BlogDetail";

describe("sanitizeHtml / safeHref (A11, M23)", () => {
  it("strips event handlers, scripts and javascript: links", () => {
    const out = sanitizeHtml('<p>Hi</p><img src=x onerror="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)">x</a>');
    expect(out).toContain("<p>Hi</p>");
    expect(out).not.toMatch(/onerror|<script|javascript:/i);
  });

  it("keeps normal links", () => {
    expect(sanitizeHtml('<a href="https://suntrix.ai" target="_blank">ok</a>')).toContain('href="https://suntrix.ai"');
  });

  it.each([
    ["javascript:alert(1)", undefined],
    [" JavaScript:alert(1)", undefined],
    ["data:text/html,<script>", undefined],
    ["//evil.example", undefined],
    ["https://linkedin.com/in/x", "https://linkedin.com/in/x"],
    ["mailto:hi@suntrix.ai", "mailto:hi@suntrix.ai"],
    ["/contact", "/contact"],
  ])("safeHref(%j) → %j", (input, expected) => {
    expect(safeHref(input)).toBe(expected);
  });
});

describe("BlogDetail renders a malicious post safely", () => {
  it("removes injected script vectors from both HTML and markdown content", async () => {
    apiRequest.mockImplementation(async (url: string) =>
      url.includes("/posts/slug/")
        ? {
            data: {
              _id: "p1", title: "Owned", slug: "owned", excerpt: "", category: "AI", tags: [], status: "published",
              createdAt: "2026-10-01T00:00:00.000Z",
              content: '<p>Body text</p><img src=x onerror="window.__xss=1"><a href="javascript:window.__xss=2">click</a>',
            },
            error: null,
          }
        : { data: { posts: [] }, error: null }
    );

    const { container } = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/blog/owned"]}>
          <Routes>
            <Route path="/blog/:slug" element={<BlogDetail />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText("Body text")).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/onerror|javascript:/i);
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
  });
});
