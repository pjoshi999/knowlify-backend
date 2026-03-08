import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../logger";

export interface ErrorResponse {
  code: string;
  message: string;
  details?: any;
  retryAfter?: number;
  requestId: string;
}

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: any,
    public retryAfter?: number
  ) {
    super(message);
    this.name = "AppError";
    Error.captureStackTrace(this, this.constructor);
  }
}

export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = (req.headers["x-request-id"] as string) || uuidv4();

  // Log error with context
  logger.error({
    message: "Request error",
    requestId,
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    userId: (req as any).user?.id,
  });

  // Handle known AppError
  if (err instanceof AppError) {
    const response: ErrorResponse = {
      code: err.code,
      message: err.message,
      details: err.details,
      retryAfter: err.retryAfter,
      requestId,
    };

    res.status(err.statusCode).json(response);
    return;
  }

  // Handle specific error types
  if (err.name === "ValidationError") {
    const response: ErrorResponse = {
      code: "VALIDATION_ERROR",
      message: "Request validation failed",
      details: err.message,
      requestId,
    };
    res.status(400).json(response);
    return;
  }

  if (err.name === "UnauthorizedError") {
    const response: ErrorResponse = {
      code: "UNAUTHORIZED",
      message: "Authentication required",
      requestId,
    };
    res.status(401).json(response);
    return;
  }

  // Handle rate limit errors
  if (err.message.includes("rate limit")) {
    const response: ErrorResponse = {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Rate limit exceeded",
      retryAfter: 60, // Default 60 seconds
      requestId,
    };
    res.status(429).json(response);
    return;
  }

  // Handle AWS SDK errors
  if (err.name === "ServiceException" || err.name === "S3ServiceException") {
    const response: ErrorResponse = {
      code: "EXTERNAL_SERVICE_ERROR",
      message: "External service error",
      details: "Storage service temporarily unavailable",
      retryAfter: 30,
      requestId,
    };
    res.status(503).json(response);
    return;
  }

  // Default internal server error
  const response: ErrorResponse = {
    code: "INTERNAL_SERVER_ERROR",
    message: "An unexpected error occurred",
    requestId,
  };

  res.status(500).json(response);
}

// Async error wrapper
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
