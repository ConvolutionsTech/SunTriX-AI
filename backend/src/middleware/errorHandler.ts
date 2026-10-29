import { Request, Response, NextFunction } from "express";
import { AppError } from "../shared/errors/appError";

/**
 * Single error contract for every API response:
 *   { error: string, code?: string, details?: [{ field, message }], requestId? }
 * Known library errors map to 4xx; anything unexpected is a 500 whose message
 * is hidden in production and always logged.
 */
interface Normalised {
  status: number;
  message: string;
  code?: string;
  details?: { field: string; message: string }[];
}

function normalise(err: any): Normalised {
  if (err?.name === "CastError") return { status: 400, message: "Invalid id", code: "INVALID_ID" };
  if (err?.name === "ValidationError" && err.errors) {
    const details = Object.values(err.errors).map((e: any) => ({ field: e.path, message: e.message }));
    return { status: 400, message: "Validation failed", code: "VALIDATION_FAILED", details };
  }
  if (err?.code === 11000) {
    const field = Object.keys(err.keyValue ?? err.keyPattern ?? {})[0];
    return { status: 409, message: field ? `That ${field} is already in use` : "Duplicate value", code: "DUPLICATE" };
  }
  if (typeof err?.message === "string" && err.message.startsWith("CORS")) return { status: 403, message: "Origin not allowed", code: "CORS" };
  if (err?.type === "entity.too.large") return { status: 413, message: "Request body too large", code: "TOO_LARGE" };
  if (err?.type === "entity.parse.failed") return { status: 400, message: "Malformed JSON body", code: "BAD_JSON" };
  // Our AppErrors and other errors that already carry an HTTP status (body-parser, http-errors)
  if (err instanceof AppError || typeof err?.statusCode === "number") {
    return { status: err.statusCode, message: err.message, code: err.code };
  }
  return { status: 500, message: err?.message || "Internal Server Error" };
}

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction): void {
  const { status, message, code, details } = normalise(err);
  const requestId = (req as Request & { id?: string }).id;

  if (status >= 500) {
    console.error(`[${requestId ?? "-"}] ${req.method} ${req.originalUrl} → ${status}:`, err);
  }

  const hideDetails = status >= 500 && process.env.NODE_ENV === "production";
  res.status(status).json({
    error: hideDetails ? "Internal Server Error" : message,
    ...(code && { code }),
    ...(details && { details }),
    ...(requestId && { requestId }),
  });
}

/** Expected (operational) error with an HTTP status. */
export function createError(message: string, statusCode = 400): AppError {
  return new AppError(message, statusCode);
}
