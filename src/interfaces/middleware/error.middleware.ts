import { Request, Response, NextFunction } from "express";
import { DomainError } from "../../domain/errors/domain.errors.js";
import { createModuleLogger } from "../../shared/logger.js";
import { sendError } from "../utils/response.js";

const log = createModuleLogger("error-handler");

export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  log.error(
    {
      err: error,
      path: req.path,
      method: req.method,
    },
    `${req.method} ${req.path} error: ${error.message}`
  );

  if (error instanceof DomainError) {
    sendError(res, req, {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
      details: error.details,
    });
    return;
  }

  sendError(res, req, {
    statusCode: 500,
    code: "INTERNAL_SERVER_ERROR",
    message: "An unexpected error occurred",
  });
};
