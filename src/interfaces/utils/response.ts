import type { Request, Response } from "express";

export const sendSuccess = <T>(
  res: Response,
  payload?: T,
  statusCode: number = 200
): Response => {
  return res.status(statusCode).json({
    success: true,
    data: payload ?? null,
  });
};

export const sendMessage = (
  res: Response,
  message: string,
  statusCode: number = 200
): Response => {
  return sendSuccess(res, { message }, statusCode);
};

export const sendError = (
  res: Response,
  req: Request,
  input: {
    statusCode: number;
    code: string;
    message: string;
    details?: unknown;
  }
): Response => {
  return res.status(input.statusCode).json({
    success: false,
    error: {
      code: input.code,
      message: input.message,
      details: input.details,
    },
    meta: {
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
      method: req.method,
    },
  });
};
