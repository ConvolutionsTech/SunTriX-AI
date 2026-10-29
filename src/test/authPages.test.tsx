import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const apiRequest = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiRequest: (...args: unknown[]) => apiRequest(...args) };
});

import { ENDPOINTS } from "@/lib/api";
import { authManager } from "@/lib/auth";
import AdminPasswordReset from "@/pages/admin/AdminPasswordReset";
import AdminAccount from "@/pages/admin/AdminAccount";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/forgot-password" element={<AdminPasswordReset />} />
        <Route path="/admin/reset-password/:token" element={<AdminPasswordReset />} />
        <Route path="/admin/account" element={<AdminAccount />} />
        <Route path="/admin/login" element={<p>login page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  apiRequest.mockReset();
});

describe("password reset pages", () => {
  it("requests a reset link and shows the neutral confirmation", async () => {
    apiRequest.mockResolvedValue({ data: { message: "If that email belongs to an admin, a reset link has been sent." }, error: null });
    renderAt("/admin/forgot-password");
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@suntrix.test" } });
    fireEvent.click(screen.getByRole("button", { name: /reset link/i }));
    expect(await screen.findByRole("status")).toHaveTextContent("reset link has been sent");
    expect(apiRequest).toHaveBeenCalledWith(ENDPOINTS.AUTH_FORGOT, { method: "POST", body: { email: "a@suntrix.test" } });
  });

  it("checks the new password locally, then resets and returns to sign-in", async () => {
    apiRequest.mockResolvedValue({ data: { message: "ok" }, error: null });
    renderAt("/admin/reset-password/tok123");
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "long-enough-password" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "different-password!" } });
    fireEvent.click(screen.getByRole("button", { name: /set new password/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("don't match");
    expect(apiRequest).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "long-enough-password" } });
    fireEvent.click(screen.getByRole("button", { name: /set new password/i }));
    expect(await screen.findByText("login page")).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith(ENDPOINTS.AUTH_RESET("tok123"), { method: "POST", body: { password: "long-enough-password" } });
  });
});

describe("My Account", () => {
  it("changes the password and keeps the session with the new tokens", async () => {
    authManager.login("old-access", "old-refresh", { id: "1", email: "a@suntrix.test", role: "viewer", name: "Ada" });
    apiRequest.mockResolvedValue({ data: { token: "new-access", refreshToken: "new-refresh" }, error: null });
    renderAt("/admin/account");

    fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "current-password" } });
    fireEvent.change(screen.getByLabelText(/New password/), { target: { value: "a-brand-new-password" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "a-brand-new-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    await waitFor(() => expect(authManager.getToken()).toBe("new-access"));
    expect(authManager.getRefreshToken()).toBe("new-refresh");
    authManager.clear();
  });
});
