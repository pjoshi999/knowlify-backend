import {
  Router,
  Request,
  Response,
  NextFunction,
  RequestHandler,
} from "express";
import multer from "multer";
import { StoragePort } from "../../application/ports/storage.port.js";
import { createUploadFileUseCase } from "../../application/use-cases/storage/upload-file.use-case.js";
import { createDeleteFileUseCase } from "../../application/use-cases/storage/delete-file.use-case.js";
import { createGenerateSignedUrlUseCase } from "../../application/use-cases/storage/generate-signed-url.use-case.js";
import { sendError, sendMessage, sendSuccess } from "../utils/response.js";

interface UploadRoutesConfig {
  storage: StoragePort;
  authenticate: RequestHandler;
  requireRole: (role: string) => RequestHandler;
}

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB
  },
});

export const createUploadRoutes = ({
  storage,
  authenticate,
  requireRole,
}: UploadRoutesConfig): Router => {
  const router = Router();

  const uploadFile = createUploadFileUseCase(storage);
  const deleteFile = createDeleteFileUseCase(storage);
  const generateSignedUrl = createGenerateSignedUrlUseCase(storage);

  // Upload course video (instructor only)
  router.post(
    "/video",
    authenticate,
    requireRole("INSTRUCTOR"),
    upload.single("file"),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!req.file) {
          sendError(res, req, {
            statusCode: 400,
            code: "VALIDATION_ERROR",
            message: "No file uploaded",
          });
          return;
        }

        const result = await uploadFile({
          file: req.file.buffer,
          fileName: req.file.originalname,
          mimeType: req.file.mimetype,
          folder: "videos",
        });

        sendSuccess(res, result, 201);
      } catch (error) {
        next(error);
      }
    }
  );

  // Upload course thumbnail (instructor only)
  router.post(
    "/thumbnail",
    authenticate,
    requireRole("INSTRUCTOR"),
    upload.single("file"),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!req.file) {
          sendError(res, req, {
            statusCode: 400,
            code: "VALIDATION_ERROR",
            message: "No file uploaded",
          });
          return;
        }

        const result = await uploadFile({
          file: req.file.buffer,
          fileName: req.file.originalname,
          mimeType: req.file.mimetype,
          folder: "thumbnails",
        });

        sendSuccess(res, result, 201);
      } catch (error) {
        next(error);
      }
    }
  );

  // Upload course document (instructor only)
  router.post(
    "/document",
    authenticate,
    requireRole("INSTRUCTOR"),
    upload.single("file"),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!req.file) {
          sendError(res, req, {
            statusCode: 400,
            code: "VALIDATION_ERROR",
            message: "No file uploaded",
          });
          return;
        }

        const result = await uploadFile({
          file: req.file.buffer,
          fileName: req.file.originalname,
          mimeType: req.file.mimetype,
          folder: "documents",
        });

        sendSuccess(res, result, 201);
      } catch (error) {
        next(error);
      }
    }
  );

  // Delete file (instructor only)
  router.delete(
    "/file",
    authenticate,
    requireRole("INSTRUCTOR"),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        // Get key from query parameter
        const key = req.query["key"] as string;

        if (!key) {
          sendError(res, req, {
            statusCode: 400,
            code: "VALIDATION_ERROR",
            message: "File key is required in query parameter",
          });
          return;
        }

        await deleteFile(key);

        sendMessage(res, "File deleted successfully");
      } catch (error) {
        next(error);
      }
    }
  );

  // Generate signed URL for private content (authenticated users only)
  router.post(
    "/signed-url",
    authenticate,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { key, expiresIn } = req.body;

        if (!key) {
          sendError(res, req, {
            statusCode: 400,
            code: "VALIDATION_ERROR",
            message: "File key is required",
          });
          return;
        }

        const signedUrl = await generateSignedUrl({ key, expiresIn });

        sendSuccess(res, { url: signedUrl });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
};
