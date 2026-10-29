import { useState, useEffect } from "react";

export interface User {
  id: string;
  email: string;
  role: string;
  name?: string;
}

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: User | null;
  isAuthenticated: boolean;
}

const TOKEN_KEY = "suntrix_auth_token";
const REFRESH_KEY = "suntrix_refresh_token";
const USER_KEY = "suntrix_auth_user";

// Keys written by the old login page; migrated once so existing sessions survive
const LEGACY_TOKEN_KEY = "auth_token";
const LEGACY_REFRESH_KEY = "refresh_token";
const LEGACY_USER_KEY = "suntrix_admin_session";

// localStorage can throw (private mode, blocked storage) — auth then lives in memory only
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage unavailable — the in-memory state is still updated
  }
}

function parseUser(raw: string | null): User | null {
  if (!raw) return null;
  try {
    const user = JSON.parse(raw);
    return user && typeof user === "object" ? (user as User) : null;
  } catch {
    return null;
  }
}

function migrateLegacySession() {
  const legacyToken = read(LEGACY_TOKEN_KEY);
  if (legacyToken && !read(TOKEN_KEY)) {
    write(TOKEN_KEY, legacyToken);
    write(REFRESH_KEY, read(LEGACY_REFRESH_KEY));
    write(USER_KEY, read(LEGACY_USER_KEY));
  }
  for (const key of [LEGACY_TOKEN_KEY, LEGACY_REFRESH_KEY, LEGACY_USER_KEY]) write(key, null);
}

class AuthManager {
  private state: AuthState;
  private listeners = new Set<() => void>();

  constructor() {
    migrateLegacySession();
    this.state = this.loadState();

    // Refresh tokens rotate on every use: when another tab refreshes or logs
    // out, adopt its tokens so this tab never presents a stale one
    if (typeof window !== "undefined") {
      window.addEventListener("storage", (event) => {
        if (event.key === null || [TOKEN_KEY, REFRESH_KEY, USER_KEY].includes(event.key)) {
          this.state = this.loadState();
          this.notify();
        }
      });
    }
  }

  private loadState(): AuthState {
    const token = read(TOKEN_KEY);
    return {
      token,
      refreshToken: read(REFRESH_KEY),
      user: parseUser(read(USER_KEY)),
      isAuthenticated: !!token,
    };
  }

  public getState(): AuthState {
    return { ...this.state };
  }

  public getToken(): string | null {
    return this.state.token;
  }

  public getRefreshToken(): string | null {
    return this.state.refreshToken;
  }

  public getUser(): User | null {
    return this.state.user;
  }

  public isAuthenticated(): boolean {
    return this.state.isAuthenticated;
  }

  public login(token: string, refreshToken: string, user: User) {
    write(TOKEN_KEY, token);
    write(REFRESH_KEY, refreshToken);
    write(USER_KEY, JSON.stringify(user));
    this.state = { token, refreshToken, user, isAuthenticated: true };
    this.notify();
  }

  /** Called after a successful token refresh. */
  public setTokens(token: string, refreshToken: string) {
    write(TOKEN_KEY, token);
    write(REFRESH_KEY, refreshToken);
    this.state = { ...this.state, token, refreshToken, isAuthenticated: true };
    this.notify();
  }

  /** Clears the session locally. Use `logout()` from `@/lib/api` to also notify the server. */
  public clear() {
    for (const key of [TOKEN_KEY, REFRESH_KEY, USER_KEY, LEGACY_TOKEN_KEY, LEGACY_REFRESH_KEY, LEGACY_USER_KEY]) {
      write(key, null);
    }
    this.state = { token: null, refreshToken: null, user: null, isAuthenticated: false };
    this.notify();
  }

  public subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }
}

export const authManager = new AuthManager();

export function useAuth() {
  const [state, setState] = useState<AuthState>(authManager.getState());

  useEffect(() => {
    return authManager.subscribe(() => {
      setState(authManager.getState());
    });
  }, []);

  return state;
}
