import { Request, Response, NextFunction } from "express";

import {
  DomainError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
} from "../../domain/errors/domain.errors.js";

interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    timestamp: string;
  };
}

export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  console.error("Error:", {
    name: error.name,
    message: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
  });

  const timestamp = new Date().toISOString();

  if (error instanceof ValidationError) {
    const response: ErrorResponse = {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: error.message,
        details: error.field ? { field: error.field } : undefined,
        timestamp,
      },
    };
    res.status(422).json(response);
    return;
  }

  if (error instanceof NotFoundError) {
    const response: ErrorResponse = {
      success: false,
      error: {
        code: "NOT_FOUND",
        message: error.message,
        timestamp,
      },
    };
    res.status(404).json(response);
    return;
  }

  if (error instanceof UnauthorizedError) {
    const response: ErrorResponse = {
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: error.message,
        timestamp,
      },
    };
    res.status(401).json(response);
    return;
  }

  if (error instanceof ForbiddenError) {
    const response: ErrorResponse = {
      success: false,
      error: {
        code: "FORBIDDEN",
        message: error.message,
        timestamp,
      },
    };
    res.status(403).json(response);
    return;
  }

  if (error instanceof ConflictError) {
    const response: ErrorResponse = {
      success: false,
      error: {
        code: "CONFLICT",
        message: error.message,
        timestamp,
      },
    };
    res.status(409).json(response);
    return;
  }

  if (error instanceof DomainError) {
    const response: ErrorResponse = {
      success: false,
      error: {
        code: "DOMAIN_ERROR",
        message: error.message,
        timestamp,
      },
    };
    res.status(400).json(response);
    return;
  }

  const response: ErrorResponse = {
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred",
      timestamp,
    },
  };
  res.status(500).json(response);
};
