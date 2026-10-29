/** Money is stored and sent as integer cents (matches backend/src/lib/money.ts). */
export function formatCents(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format((cents || 0) / 100);
}

/** Dollars typed in a form → integer cents for the API. */
export function toCents(dollars: number | string): number {
  const n = typeof dollars === "number" ? dollars : parseFloat(dollars);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
