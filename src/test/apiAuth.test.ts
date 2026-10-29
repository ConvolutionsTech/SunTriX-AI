import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// apiRequest and authManager are module singletons; load fresh copies per test
async function load() {
  vi.resetModules();
  const api = await import("@/lib/api");
  const { authManager } = await import("@/lib/auth");
  return { ...api, authManager };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  window.history.pushState({}, "", "/");
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function authHeader(callIndex: number): string | undefined {
  const init = fetchMock.mock.calls[callIndex][1] as RequestInit;
  return (init.headers as Record<string, string>).Authorization;
}

describe("apiRequest auth header", () => {
  it("sends the token on admin pages", async () => {
    const { apiRequest, authManager, ENDPOINTS } = await load();
    authManager.login("access-1", "refresh-1", { id: "1", email: "a@x.test", role: "admin" });
    window.history.pushState({}, "", "/admin/content");
    fetchMock.mockResolvedValue(json(200, {}));

    await apiRequest(ENDPOINTS.TEAM_LIST);
    expect(authHeader(0)).toBe("Bearer access-1");
  });

  it("does not send the token on public pages, so drafts are never requested", async () => {
    const { apiRequest, authManager, ENDPOINTS } = await load();
    authManager.login("access-1", "refresh-1", { id: "1", email: "a@x.test", role: "admin" });
    window.history.pushState({}, "", "/pricing");
    fetchMock.mockResolvedValue(json(200, []));

    await apiRequest(ENDPOINTS.PRICING_LIST);
    expect(authHeader(0)).toBeUndefined();
  });

  it("a public 401 is just an error — no refresh, no logout", async () => {
    const { apiRequest, authManager, ENDPOINTS } = await load();
    authManager.login("access-1", "refresh-1", { id: "1", email: "a@x.test", role: "admin" });
    fetchMock.mockResolvedValue(json(401, { message: "nope" }));

    const res = await apiRequest(ENDPOINTS.TEAM_LIST);
    expect(res.error).toBe("nope");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(authManager.isAuthenticated()).toBe(true);
  });
});

describe("token refresh", () => {
  it("runs one refresh for concurrent 401s and persists the new tokens", async () => {
    const { apiRequest, authManager, ENDPOINTS } = await load();
    authManager.login("expired", "refresh-1", { id: "1", email: "a@x.test", role: "admin" });
    window.history.pushState({}, "", "/admin/content");

    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (url === ENDPOINTS.AUTH_REFRESH) return json(200, { token: "access-2", refreshToken: "refresh-2" });
      const auth = (init.headers as Record<string, string>).Authorization;
      return auth === "Bearer access-2" ? json(200, { ok: true }) : json(401, { message: "expired" });
    });

    const results = await Promise.all([1, 2, 3, 4, 5].map(() => apiRequest(ENDPOINTS.TEAM_LIST)));

    expect(results.every((r) => r.error === null)).toBe(true);
    expect(fetchMock.mock.calls.filter(([url]) => url === ENDPOINTS.AUTH_REFRESH)).toHaveLength(1);
    expect(authManager.getToken()).toBe("access-2");
    expect(localStorage.getItem("suntrix_auth_token")).toBe("access-2");
    expect(localStorage.getItem("suntrix_refresh_token")).toBe("refresh-2");
  });

  it("clears the session when refresh fails", async () => {
    const { apiRequest, authManager, ENDPOINTS } = await load();
    authManager.login("expired", "refresh-bad", { id: "1", email: "a@x.test", role: "admin" });
    window.history.pushState({}, "", "/admin/login"); // avoid a real navigation in jsdom
    fetchMock.mockResolvedValue(json(401, { message: "expired" }));

    const res = await apiRequest(ENDPOINTS.TEAM_LIST, { auth: true });
    expect(res.error).toMatch(/Session expired/);
    expect(authManager.isAuthenticated()).toBe(false);
  });
});

describe("session storage", () => {
  it("logout clears every auth key and tells the server", async () => {
    const { logout, authManager, ENDPOINTS } = await load();
    authManager.login("access-1", "refresh-1", { id: "1", email: "a@x.test", role: "admin" });
    fetchMock.mockResolvedValue(json(200, {}));

    await logout();
    expect(fetchMock).toHaveBeenCalledWith(ENDPOINTS.AUTH_LOGOUT, expect.objectContaining({ method: "POST" }));
    for (const key of ["suntrix_auth_token", "suntrix_refresh_token", "suntrix_auth_user"]) {
      expect(localStorage.getItem(key)).toBeNull();
    }
    expect(authManager.isAuthenticated()).toBe(false);
  });

  it("migrates a session saved under the old keys", async () => {
    localStorage.setItem("auth_token", "legacy-access");
    localStorage.setItem("refresh_token", "legacy-refresh");
    localStorage.setItem("suntrix_admin_session", JSON.stringify({ id: "1", email: "a@x.test", role: "admin", name: "Ada" }));

    const { authManager } = await load();
    expect(authManager.getToken()).toBe("legacy-access");
    expect(authManager.getRefreshToken()).toBe("legacy-refresh");
    expect(authManager.getUser()?.name).toBe("Ada");
    expect(localStorage.getItem("auth_token")).toBeNull();
  });

  it("survives a corrupted stored user", async () => {
    localStorage.setItem("suntrix_auth_token", "t");
    localStorage.setItem("suntrix_auth_user", "{not json");
    const { authManager } = await load();
    expect(authManager.isAuthenticated()).toBe(true);
    expect(authManager.getUser()).toBeNull();
  });
});

describe("apiUpload (T-FE-9)", () => {
  it("sends multipart without a JSON content type and refreshes an expired token", async () => {
    const { apiUpload, authManager, ENDPOINTS } = await load();
    authManager.login("expired", "refresh-1", { id: "1", email: "a@x.test", role: "admin" });

    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (url === ENDPOINTS.AUTH_REFRESH) return json(200, { token: "access-2", refreshToken: "refresh-2" });
      const auth = (init.headers as Record<string, string>).Authorization;
      return auth === "Bearer access-2" ? json(201, { url: "https://cdn.test/a.png" }) : json(401, { message: "expired" });
    });

    const form = new FormData();
    form.append("file", new Blob(["x"]), "a.png");
    const res = await apiUpload<{ url: string }>(ENDPOINTS.UPLOAD_IMAGE, form);

    expect(res).toMatchObject({ data: { url: "https://cdn.test/a.png" }, error: null, status: 201 });
    const lastInit = fetchMock.mock.calls.at(-1)![1] as RequestInit;
    expect(lastInit.body).toBe(form);
    expect((lastInit.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
  });

  it("surfaces the backend's error message", async () => {
    const { apiUpload, authManager, ENDPOINTS } = await load();
    authManager.login("access-1", "refresh-1", { id: "1", email: "a@x.test", role: "admin" });
    fetchMock.mockResolvedValue(json(413, { error: "File too large (max 50 MB)" }));

    const res = await apiUpload(ENDPOINTS.UPLOAD_IMAGE, new FormData());
    expect(res.error).toBe("File too large (max 50 MB)");
  });
});

describe("error messages (T-FE-10, M13)", () => {
  it.each([
    [{ message: "Post not found" }, 404, "Post not found"],
    [{ error: "Too many submissions. Please try again in an hour." }, 429, "Too many submissions. Please try again in an hour."],
    [{ error: "Validation failed", details: [{ field: "message", message: "Message is required" }] }, 400, "message: Message is required"],
    [{}, 429, "Too many requests — please wait a moment and try again."],
    [{}, 503, "The server ran into a problem. Please try again shortly."],
    [null, 404, "Request failed (404)"],
  ])("%j with %i → %s", async (body, status, expected) => {
    const { errorMessage } = await load();
    expect(errorMessage(body, status)).toBe(expected);
  });

  it("returns the HTTP status so pages can tell errors apart", async () => {
    const { apiRequest, ENDPOINTS } = await load();
    fetchMock.mockResolvedValue(new Response("<html>bad gateway</html>", { status: 502 }));
    const res = await apiRequest(ENDPOINTS.TEAM_LIST);
    expect(res).toEqual({ data: null, error: "The server ran into a problem. Please try again shortly.", status: 502 });
  });
});

