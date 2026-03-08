import { Router, Request, Response, NextFunction } from "express";
import { TranscodingJobPublisher } from "@application/services/transcoding-job-publisher.service.js";
import {
  TranscodingResult,
  TranscodingFailure,
} from "@domain/models/transcoding-job.model.js";
import { sendSuccess, sendError } from "../utils/response.js";
import { logger } from "@shared/logger.js";

interface TranscodingRoutesConfig {
  transcodingPublisher: TranscodingJobPublisher;
}

export const createTranscodingRoutes = (
  config: TranscodingRoutesConfig
): Router => {
  const router = Router();
  const { transcodingPublisher } = config;

  // POST /api/v1/transcoding/callback/completion - Handle transcoding completion
  router.post(
    "/callback/completion",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const result: TranscodingResult = req.body;

        // Validate required fields
        if (!result.jobId || !result.sessionId || !result.outputs) {
          sendError(res, req, {
            statusCode: 400,
            code: "VALIDATION_ERROR",
            message: "Missing required fields: jobId, sessionId, outputs",
          });
          return;
        }

        await transcodingPublisher.handleCompletion(result);

        sendSuccess(res, { acknowledged: true });
      } catch (error) {
        logger.error({
          message: "Failed to handle transcoding completion callback",
          error,
        });
        next(error);
      }
    }
  );

  // POST /api/v1/transcoding/callback/failure - Handle transcoding failure
  router.post(
    "/callback/failure",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const failure: TranscodingFailure = req.body;

        // Validate required fields
        if (!failure.jobId || !failure.sessionId || !failure.error) {
          sendError(res, req, {
            statusCode: 400,
            code: "VALIDATION_ERROR",
            message: "Missing required fields: jobId, sessionId, error",
          });
          return;
        }

        await transcodingPublisher.handleFailure(failure);

        sendSuccess(res, { acknowledged: true });
      } catch (error) {
        logger.error({
          message: "Failed to handle transcoding failure callback",
          error,
        });
        next(error);
      }
    }
  );

  // GET /api/v1/transcoding/jobs/:jobId - Get job status
  router.get(
    "/jobs/:jobId",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const jobId = req.params["jobId"] as string;

        const job = await transcodingPublisher.getJobStatus(jobId);

        if (!job) {
          sendError(res, req, {
            statusCode: 404,
            code: "JOB_NOT_FOUND",
            message: `Transcoding job ${jobId} not found`,
          });
          return;
        }

        sendSuccess(res, job);
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
};
