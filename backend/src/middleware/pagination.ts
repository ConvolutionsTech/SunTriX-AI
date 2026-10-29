import { Request, Response } from "express";

/**
 * Bounded paging for list endpoints: `?limit` (1…maxLimit, default
 * defaultLimit) and `?skip` (0…100 000). Lists keep their response shape;
 * the full count goes in the `X-Total-Count` header.
 */
export function pageParams(req: Request, opts: { defaultLimit: number; maxLimit: number }): { limit: number; skip: number } {
  const limit = parseInt(String(req.query.limit));
  const skip = parseInt(String(req.query.skip));
  return {
    limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), opts.maxLimit) : opts.defaultLimit,
    skip: Number.isFinite(skip) ? Math.min(Math.max(skip, 0), 100_000) : 0,
  };
}

export function setTotal(res: Response, total: number): void {
  res.setHeader("X-Total-Count", String(total));
}

/** Integer query parameter clamped to [min, max]. */
export function clampedInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = parseInt(String(value));
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
}
