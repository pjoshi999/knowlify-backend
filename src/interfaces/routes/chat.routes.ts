import {
  Router,
  type Request,
  type Response,
  type RequestHandler,
} from "express";
import multer from "multer";
import type { ChatRepository } from "../../application/ports/chat.repository.port.js";
import type { AIPort } from "../../application/ports/ai.port.js";
import type { StoragePort } from "../../application/ports/storage.port.js";
import type { QueuePort } from "../../application/ports/queue.port.js";
import { createChatSessionUseCase } from "../../application/use-cases/chat/create-chat-session.use-case.js";
import { sendChatMessageUseCase } from "../../application/use-cases/chat/send-chat-message.use-case.js";
import { getChatSessionUseCase } from "../../application/use-cases/chat/get-chat-session.use-case.js";
import { uploadCourseFilesUseCase } from "../../application/use-cases/chat/upload-course-files.use-case.js";
import { createModuleLogger } from "../../shared/logger.js";
import { sendError, sendSuccess } from "../utils/response.js";

const log = createModuleLogger("chat");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB max
  },
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype === "application/zip" ||
      file.originalname.endsWith(".zip")
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only ZIP files are allowed"));
    }
  },
});

export const createChatRoutes = (deps: {
  chatRepository: ChatRepository;
  aiService: AIPort;
  storageService: StoragePort;
  queueService: QueuePort;
  authMiddleware: RequestHandler;
}): Router => {
  const router = Router();

  // Create new chat session
  router.post(
    "/sessions",
    deps.authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const userId = (req as Request & { user: { id: string } }).user.id;

        const createSession = createChatSessionUseCase({
          chatRepository: deps.chatRepository,
        });

        const session = await createSession({ userId });

        sendSuccess(res, session, 201);
      } catch (error) {
        log.error({ err: error }, "Create chat session error");
        sendError(res, req, {
          statusCode: 500,
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create chat session",
        });
      }
    }
  );

  // Get chat session with messages
  router.get(
    "/sessions/:id",
    deps.authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const userId = (req as Request & { user: { id: string } }).user.id;
        const sessionId = String(req.params["id"]);

        if (!sessionId || sessionId === "undefined") {
          sendError(res, req, {
            statusCode: 400,
            code: "VALIDATION_ERROR",
            message: "Session ID is required",
          });
          return;
        }

        const getSession = getChatSessionUseCase({
          chatRepository: deps.chatRepository,
        });

        const result = await getSession({ sessionId, userId });

        sendSuccess(res, result);
      } catch (error) {
        log.error({ err: error }, "Get chat session error");
        sendError(res, req, {
          statusCode: 404,
          code: "NOT_FOUND",
          message: "Chat session not found",
        });
      }
    }
  );

  // Send message to chat session
  router.post(
    "/sessions/:id/messages",
    deps.authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const userId = (req as Request & { user: { id: string } }).user.id;
        const sessionId = String(req.params["id"]);
        const { content } = req.body as { content: unknown };

        if (!sessionId || sessionId === "undefined") {
          sendError(res, req, {
            statusCode: 400,
            code: "VALIDATION_ERROR",
            message: "Session ID is required",
          });
          return;
        }

        if (!content || typeof content !== "string") {
          sendError(res, req, {
            statusCode: 400,
            code: "VALIDATION_ERROR",
            message: "Message content is required",
          });
          return;
        }

        const sendMessage = sendChatMessageUseCase({
          chatRepository: deps.chatRepository,
          aiService: deps.aiService,
        });

        const message = await sendMessage({ sessionId, content, userId });

        sendSuccess(res, message);
      } catch (error) {
        log.error({ err: error }, "Send chat message error");
        sendError(res, req, {
          statusCode: 500,
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to send message",
        });
      }
    }
  );

  // Upload course files
  router.post(
    "/sessions/:id/upload",
    deps.authMiddleware,
    upload.single("file"),
    async (req: Request, res: Response) => {
      try {
        const userId = (req as Request & { user: { id: string } }).user.id;
        const sessionId = String(req.params["id"]);
        const file = req.file;

        if (!sessionId || sessionId === "undefined") {
          sendError(res, req, {
            statusCode: 400,
            code: "VALIDATION_ERROR",
            message: "Session ID is required",
          });
          return;
        }

        if (!file) {
          sendError(res, req, {
            statusCode: 400,
            code: "VALIDATION_ERROR",
            message: "ZIP file is required",
          });
          return;
        }

        const uploadFiles = uploadCourseFilesUseCase({
          chatRepository: deps.chatRepository,
          storageService: deps.storageService,
          queueService: deps.queueService,
        });

        const result = await uploadFiles({
          sessionId,
          userId,
          zipFile: file.buffer,
          fileName: file.originalname,
        });

        sendSuccess(res, result);
      } catch (error) {
        log.error({ err: error }, "Upload course files error");
        sendError(res, req, {
          statusCode: 500,
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to upload course files",
        });
      }
    }
  );

  // Get job status
  router.get(
    "/sessions/:id/job/:jobId",
    deps.authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const jobId = String(req.params["jobId"]);

        if (!jobId || jobId === "undefined") {
          sendError(res, req, {
            statusCode: 400,
            code: "VALIDATION_ERROR",
            message: "Job ID is required",
          });
          return;
        }

        const status = await deps.queueService.getJobStatus(
          "course-processing",
          jobId
        );

        if (!status) {
          sendError(res, req, {
            statusCode: 404,
            code: "NOT_FOUND",
            message: "Job not found",
          });
          return;
        }

        sendSuccess(res, status);
      } catch (error) {
        log.error({ err: error }, "Get job status error");
        sendError(res, req, {
          statusCode: 500,
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get job status",
        });
      }
    }
  );

  return router;
};
