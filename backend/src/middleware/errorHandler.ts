import { Request, Response, NextFunction } from "express";

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
  /** Machine-readable reason, passed through to the client */
  code?: string;
}

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  // Only log full stack trace for 500+ server errors or non-operational errors
  if (process.env.NODE_ENV === "development") {
    if (statusCode >= 500 || !err.isOperational) {
      console.error("❌ Server Error:", err);
    } else {
      console.warn(`[${statusCode}] ${message}`);
    }
  }

  res.status(statusCode).json({
    status: "error",
    message,
    ...(err.code && { code: err.code }),
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
}

export function createError(message: string, statusCode = 400): AppError {
  const err: AppError = new Error(message);
  err.statusCode = statusCode;
  err.isOperational = true;
  return err;
}
