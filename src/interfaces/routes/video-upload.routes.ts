import {
  Router,
  Request,
  Response,
  NextFunction,
  RequestHandler,
} from "express";
import { SessionStateManager } from "@application/services/session-state-manager.service.js";
import { ChunkManager } from "@application/services/chunk-manager.service.js";
import {
  RateLimiter,
  InstructorTier,
} from "@application/services/rate-limiter.service.js";
import { UploadScheduler } from "@application/services/upload-scheduler.service.js";
import { StorageAdapter } from "@infrastructure/adapters/storage.adapter.js";
import {
  initiateUploadSchema,
  chunkCompletionSchema,
  listUploadsSchema,
} from "@api/schemas/upload.schema.js";
import {
  ValidationError,
  SessionNotFoundError,
  UploadError,
} from "@shared/errors/upload-errors.js";
import { sendSuccess, sendError } from "../utils/response.js";
import { logger } from "@shared/logger.js";

interface VideoUploadRoutesConfig {
  sessionManager: SessionStateManager;
  chunkManager: ChunkManager;
  rateLimiter: RateLimiter;
  scheduler: UploadScheduler;
  storageAdapter: StorageAdapter;
  authenticate: RequestHandler;
  requireRole: (role: string) => RequestHandler;
}

export const createVideoUploadRoutes = (
  config: VideoUploadRoutesConfig
): Router => {
  const router = Router();
  const {
    sessionManager,
    chunkManager,
    rateLimiter,
    scheduler,
    storageAdapter,
    authenticate,
    requireRole,
  } = config;

  // POST /api/v1/video-uploads/initiate - Initiate multipart upload
  router.post(
    "/initiate",
    authenticate,
    requireRole("INSTRUCTOR"),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        // Validate request body
        const validationResult = initiateUploadSchema.safeParse(req.body);

        if (!validationResult.success) {
          throw new ValidationError("Invalid request body", {
            errors: validationResult.error.issues,
          });
        }

        const data = validationResult.data;

        // Get instructor tier (would come from user context in real app)
        const instructorTier: InstructorTier = "standard"; // TODO: Get from user profile

        // Check rate limits
        await rateLimiter.checkApiRateLimit(data.instructorId, instructorTier);
        await rateLimiter.checkPresignedUrlLimit(data.instructorId);

        const canUpload = await rateLimiter.canStartUpload(
          data.instructorId,
          instructorTier
        );

        if (!canUpload.allowed) {
          sendError(res, req, {
            statusCode: 429,
            code: "RATE_LIMIT_EXCEEDED",
            message: canUpload.reason || "Rate limit exceeded",
            details: { retryAfter: canUpload.retryAfter },
          });
          return;
        }

        // Check daily quota
        await rateLimiter.checkDailyQuota(
          data.instructorId,
          instructorTier,
          data.fileSize
        );

        // Create upload session
        const session = await sessionManager.createSession({
          instructorId: data.instructorId,
          courseId: data.courseId,
          fileName: data.fileName,
          fileSize: data.fileSize,
          mimeType: data.mimeType,
          checksum: data.checksum,
        });

        // Initiate multipart upload in S3
        const uploadId = await storageAdapter.initiateMultipartUpload({
          key: session.storageKey,
          contentType: data.mimeType,
          metadata: {
            instructorId: data.instructorId,
            courseId: data.courseId,
            originalFileName: data.fileName,
            uploadTimestamp: new Date().toISOString(),
          },
        });

        // Update session with actual S3 upload ID
        await sessionManager.updateSessionStatus(
          session.sessionId,
          "pending",
          uploadId
        );

        // Schedule upload
        const scheduleResult = await scheduler.scheduleUpload({
          sessionId: session.sessionId,
          instructorId: data.instructorId,
          instructorTier,
          fileSize: data.fileSize,
          coursePublished: false, // TODO: Check if course is published
        });

        if (scheduleResult.queued) {
          sendSuccess(
            res,
            {
              sessionId: session.sessionId,
              status: "queued",
              queuePosition: scheduleResult.queuePosition,
              estimatedStartTime: scheduleResult.estimatedStartTime,
              chunkSize: session.chunkSize,
              totalChunks: session.totalChunks,
            },
            202
          );
          return;
        }

        // Acquire upload slot
        await rateLimiter.acquireUploadSlot(
          data.instructorId,
          session.sessionId
        );

        // Generate pre-signed URL for first chunk
        const presignedUrl = await storageAdapter.generatePresignedUrl({
          key: session.storageKey,
          uploadId,
          partNumber: 1,
          expiresIn: 86400, // 24 hours
          edgeAcceleration: true,
        });

        // Update session status to uploading
        await sessionManager.updateSessionStatus(
          session.sessionId,
          "uploading"
        );

        sendSuccess(
          res,
          {
            sessionId: session.sessionId,
            uploadUrl: presignedUrl.url,
            expiresAt: presignedUrl.expiresAt.toISOString(),
            chunkSize: session.chunkSize,
            totalChunks: session.totalChunks,
            uploadId,
          },
          201
        );
      } catch (error) {
        next(error);
      }
    }
  );

  // POST /api/v1/video-uploads/:sessionId/chunks/:chunkNumber - Report chunk completion
  router.post(
    "/:sessionId/chunks/:chunkNumber",
    authenticate,
    requireRole("INSTRUCTOR"),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const sessionId = req.params["sessionId"] as string;
        const chunkNumber = req.params["chunkNumber"] as string;
        const chunkNum = parseInt(chunkNumber, 10);

        if (isNaN(chunkNum) || chunkNum < 1) {
          throw new ValidationError("Invalid chunk number");
        }

        // Validate request body
        const validationResult = chunkCompletionSchema.safeParse(req.body);

        if (!validationResult.success) {
          throw new ValidationError("Invalid request body", {
            errors: validationResult.error.issues,
          });
        }

        const { etag, checksum } = validationResult.data;

        // Get session
        const session = await sessionManager.getSession(sessionId);

        if (!session) {
          throw new SessionNotFoundError(sessionId);
        }

        // Record chunk completion
        await chunkManager.recordChunkCompletion({
          sessionId,
          chunkNumber: chunkNum,
          etag,
          checksum,
        });

        // Calculate progress
        const progress = await chunkManager.calculateProgress(
          sessionId,
          session
        );

        // Check if upload is complete
        const isComplete = await chunkManager.isUploadComplete(
          sessionId,
          session.totalChunks
        );

        if (isComplete) {
          // Finalize multipart upload
          await chunkManager.finalizeUpload(session);

          // Update session status to processing
          await sessionManager.updateSessionStatus(sessionId, "processing");

          // Release upload slot
          await rateLimiter.releaseUploadSlot(session.instructorId, sessionId);

          // TODO: Publish transcoding job

          logger.info({ message: "Upload completed", sessionId });
        }

        sendSuccess(res, {
          acknowledged: true,
          progress: {
            sessionId,
            status: isComplete ? "processing" : "uploading",
            ...progress,
          },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // GET /api/v1/video-uploads/:sessionId/progress - Get upload progress
  router.get(
    "/:sessionId/progress",
    authenticate,
    requireRole("INSTRUCTOR"),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const sessionId = req.params["sessionId"] as string;

        // Get session
        const session = await sessionManager.getSession(sessionId);

        if (!session) {
          throw new SessionNotFoundError(sessionId);
        }

        // Calculate progress
        const progress = await chunkManager.calculateProgress(
          sessionId,
          session
        );

        // Get queue position if pending
        let queuePosition: number | undefined;
        let estimatedStartTime: string | undefined;

        if (session.status === "pending") {
          const queueInfo = await scheduler.getQueuePosition(sessionId);
          queuePosition = queueInfo.position;

          if (queueInfo.estimatedWaitTime > 0) {
            const startTime = new Date(
              Date.now() + queueInfo.estimatedWaitTime * 1000
            );
            estimatedStartTime = startTime.toISOString();
          }
        }

        sendSuccess(res, {
          sessionId,
          status: session.status,
          ...progress,
          queuePosition,
          estimatedStartTime,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // POST /api/v1/video-uploads/:sessionId/refresh-url - Refresh expired pre-signed URL
  router.post(
    "/:sessionId/refresh-url",
    authenticate,
    requireRole("INSTRUCTOR"),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const sessionId = req.params["sessionId"] as string;
        const { chunkNumber } = req.body;

        if (!chunkNumber || chunkNumber < 1) {
          throw new ValidationError("Chunk number is required");
        }

        // Get session
        const session = await sessionManager.getSession(sessionId);

        if (!session) {
          throw new SessionNotFoundError(sessionId);
        }

        // Extend session TTL
        await sessionManager.extendSessionTTL(sessionId);

        // Generate new pre-signed URL
        const presignedUrl = await storageAdapter.generatePresignedUrl({
          key: session.storageKey,
          uploadId: session.uploadId,
          partNumber: chunkNumber,
          expiresIn: 86400, // 24 hours
          edgeAcceleration: true,
        });

        sendSuccess(res, {
          uploadUrl: presignedUrl.url,
          expiresAt: presignedUrl.expiresAt.toISOString(),
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // DELETE /api/v1/video-uploads/:sessionId - Cancel upload
  router.delete(
    "/:sessionId",
    authenticate,
    requireRole("INSTRUCTOR"),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const sessionId = req.params["sessionId"] as string;

        // Get session
        const session = await sessionManager.getSession(sessionId);

        if (!session) {
          throw new SessionNotFoundError(sessionId);
        }

        // Abort multipart upload in S3
        await storageAdapter.abortMultipartUpload(
          session.uploadId,
          session.storageKey
        );

        // Update session status to cancelled
        await sessionManager.updateSessionStatus(sessionId, "cancelled");

        // Release upload slot
        await rateLimiter.releaseUploadSlot(session.instructorId, sessionId);

        // Remove from queue if queued
        await scheduler.removeFromQueue(sessionId);

        sendSuccess(res, { cancelled: true });
      } catch (error) {
        next(error);
      }
    }
  );

  // GET /api/v1/video-uploads - List uploads for instructor
  router.get(
    "/",
    authenticate,
    requireRole("INSTRUCTOR"),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        // Validate query parameters
        const validationResult = listUploadsSchema.safeParse(req.query);

        if (!validationResult.success) {
          throw new ValidationError("Invalid query parameters", {
            errors: validationResult.error.issues,
          });
        }

        const { instructorId, status, page, limit } = validationResult.data;

        // List sessions
        const result = await sessionManager.listSessions(
          instructorId,
          status ? { status } : undefined,
          page,
          limit
        );

        sendSuccess(res, {
          sessions: result.sessions,
          total: result.total,
          page,
          limit,
          totalPages: Math.ceil(result.total / limit),
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // Error handler middleware
  router.use(
    (error: Error, req: Request, res: Response, next: NextFunction) => {
      if (error instanceof UploadError) {
        sendError(res, req, {
          statusCode: error.statusCode,
          code: error.code,
          message: error.message,
          details: error.details,
        });
        return;
      }

      // Pass to global error handler
      next(error);
    }
  );

  return router;
};
