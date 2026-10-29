/**
 * Browser origins allowed to call the API: FRONTEND_URL plus any extra
 * comma-separated CORS_ORIGINS (e.g. a staging or admin domain). Local dev
 * servers are allowed only outside production.
 */
const DEV_ORIGINS = ["http://localhost:8080", "http://localhost:5173", "http://localhost:3000"];

const normalise = (origin: string) => origin.trim().replace(/\/+$/, "");

export function allowedOrigins(): string[] {
  const configured = [process.env.FRONTEND_URL ?? "", ...(process.env.CORS_ORIGINS ?? "").split(",")].map(normalise).filter(Boolean);
  const dev = process.env.NODE_ENV === "production" ? [] : DEV_ORIGINS;
  return [...new Set([...configured, ...dev])];
}

export function isAllowedOrigin(origin: string): boolean {
  return allowedOrigins().includes(normalise(origin));
}
