/**
 * Upload Routes
 * 
 * API endpoints for folder upload and AI-powered course creation
 */

import { Router, Request, Response, NextFunction, RequestHandler } from "express";
import multer from "multer";
import { FolderUploadService } from "../../infrastructure/services/folder-upload.service.js";
import { AIContentAnalyzer } from "../../infrastructure/services/ai-content-analyzer.service.js";
import { BackgroundJobService } from "../../infrastructure/services/background-job.service.js";
import { UploadSessionV2Repository } from "../../infrastructure/repositories/upload-session-v2.repository.js";
import { ModuleRepository } from "../../infrastructure/repositories/module.repository.js";
import { LessonRepository } from "../../infrastructure/repositories/lesson.repository.js";
import { CourseRepositoryPort } from "../../application/ports/course.repository.port.js";
import { sendSuccess, sendError } from "../utils/response.js";
import { createModuleLogger } from "../../shared/logger.js";
import { rateLimit } from "express-rate-limit";

const log = createModuleLogger("upload-routes");

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 * 1024, // 5GB per file
  },
});

// Rate limiter: 100 requests per minute
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: "Too many upload requests, please try again later",
});

interface UploadRoutesConfig {
  folderUploadService: FolderUploadService;
  aiContentAnalyzer: AIContentAnalyzer;
  backgroundJobService: BackgroundJobService;
  sessionRepository: UploadSessionV2Repository;
  moduleRepository: ModuleRepository;
  lessonRepository: LessonRepository;
  courseRepository: CourseRepositoryPort;
  authenticate: RequestHandler;
  authorizeInstructor: RequestHandler;
}

export const createUploadRoutes = ({
  folderUploadService,
  aiContentAnalyzer,
  backgroundJobService,
  sessionRepository,
  moduleRepository,
  lessonRepository,
  courseRepository,
  authenticate,
  authorizeInstructor,
}: UploadRoutesConfig): Router => {
  const router = Router();

  /**
   * POST /api/courses/folder-upload
   * Upload folder with files
   */
  router.post(
    "/folder-upload",
    authenticate,
    authorizeInstructor,
    uploadLimiter,
    upload.array("files", 100), // Max 100 files
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const instructorId = req.user!.id;
        const files = req.files as Express.Multer.File[];

        if (!files || files.length === 0) {
          return sendError(res, req, {
            statusCode: 400,
            code: 'BAD_REQUEST',
            message: 'No files uploaded',
          });
        }

        log.info({ instructorId, fileCount: files.length }, "Processing folder upload");

        // Parse folder structure from request body if provided
        const folderStructure = req.body.folderStructure 
          ? JSON.parse(req.body.folderStructure)
          : undefined;

        // Convert multer files to our format
        const uploadedFiles = files.map(file => ({
          fieldname: file.fieldname,
          originalname: file.originalname,
          encoding: file.encoding,
          mimetype: file.mimetype,
          buffer: file.buffer,
          size: file.size,
        }));

        // Upload files and create session
        const session = await folderUploadService.uploadFolder({
          instructorId,
          files: uploadedFiles,
          folderStructure,
        });

        log.info({ sessionId: session.id, fileCount: files.length }, "Folder upload successful");

        return sendSuccess(res, {
          sessionId: session.id,
          fileCount: session.fileCount,
          totalSize: session.totalSize,
          tempStoragePaths: session.tempStoragePaths,
          expiresAt: session.expiresAt,
        }, 201);
      } catch (error) {
        log.error({ error }, "Folder upload failed");
        return next(error);
      }
    }
  );

  /**
   * POST /api/courses/analyze-structure
   * Analyze uploaded folder structure with AI
   */
  router.post(
    "/analyze-structure",
    authenticate,
    authorizeInstructor,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { sessionId } = req.body;

        if (!sessionId) {
          return sendError(res, req, {
            statusCode: 400,
            code: 'BAD_REQUEST',
            message: 'Session ID is required',
          });
        }

        log.info({ sessionId }, "Analyzing folder structure");

        // Get session
        const session = await sessionRepository.getSessionById(sessionId);
        if (!session) {
          return sendError(res, req, {
            statusCode: 404,
            code: 'NOT_FOUND',
            message: 'Upload session not found',
          });
        }

        // Check if session is expired
        if (new Date() > session.expiresAt) {
          return sendError(res, req, {
            statusCode: 410,
            code: 'GONE',
            message: 'Upload session has expired',
          });
        }

        // Check if instructor owns this session
        if (session.instructorId !== req.user!.id) {
          return sendError(res, req, {
            statusCode: 403,
            code: 'FORBIDDEN',
            message: 'Unauthorized',
          });
        }

        // Build file metadata from session
        const fileMetadata = session.tempStoragePaths.map((path, index) => {
          const fileName = path.split('/').pop() || `file-${index}`;
          return {
            name: fileName,
            path: path,
            type: fileName.split('.').pop() || 'unknown',
            size: 0, // Size not stored in path, would need to fetch from S3
          };
        });

        // Analyze structure with AI
        const suggestedStructure = await aiContentAnalyzer.analyzeStructure(fileMetadata);

        // Update session with suggested structure
        await sessionRepository.updateSession(sessionId, {
          suggestedStructure,
          status: 'analyzing',
        });

        log.info({ sessionId, moduleCount: suggestedStructure.modules.length }, "Structure analysis complete");

        return sendSuccess(res, {
          sessionId,
          suggestedStructure,
        });
      } catch (error) {
        log.error({ error }, "Structure analysis failed");
        return next(error);
      }
    }
  );

  /**
   * POST /api/courses/create-with-structure
   * Create course with modules, lessons, and enqueue AI analysis jobs
   */
  router.post(
    "/create-with-structure",
    authenticate,
    authorizeInstructor,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { sessionId, courseData, structure } = req.body;
        const instructorId = req.user!.id;

        if (!sessionId || !courseData || !structure) {
          return sendError(res, req, {
            statusCode: 400,
            code: 'BAD_REQUEST',
            message: 'Missing required fields',
          });
        }

        log.info({ sessionId, courseName: courseData.name }, "Creating course with structure");

        // Get session
        const session = await sessionRepository.getSessionById(sessionId);
        if (!session) {
          return sendError(res, req, {
            statusCode: 404,
            code: 'NOT_FOUND',
            message: 'Upload session not found',
          });
        }

        // Check if session is expired
        if (new Date() > session.expiresAt) {
          return sendError(res, req, {
            statusCode: 410,
            code: 'GONE',
            message: 'Upload session has expired',
          });
        }

        // Check if instructor owns this session
        if (session.instructorId !== instructorId) {
          return sendError(res, req, {
            statusCode: 403,
            code: 'FORBIDDEN',
            message: 'Unauthorized',
          });
        }

        // Check course name uniqueness (simplified - just check by instructor)
        const existingCourses = await courseRepository.findByInstructor(instructorId);
        if (existingCourses.some(c => c.name === courseData.name)) {
          return sendError(res, req, {
            statusCode: 409,
            code: 'CONFLICT',
            message: 'Course with this name already exists',
          });
        }

        // Create course
        const course = await courseRepository.create({
          instructorId,
          name: courseData.name,
          description: courseData.description,
          category: courseData.category,
          priceAmount: courseData.priceAmount || 0,
          priceCurrency: courseData.priceCurrency || 'USD',
          thumbnailUrl: courseData.thumbnailUrl,
        });

        log.info({ courseId: course.id }, "Course created");

        // Create modules and lessons in transaction
        const analysisJobs: { lessonId: string; assetUrl: string; assetType: 'VIDEO' | 'PDF'; metadata: any }[] = [];

        for (const moduleData of structure.modules) {
          // Create module
          const module = await moduleRepository.createModule({
            courseId: course.id,
            title: moduleData.title,
            description: moduleData.description,
            order: moduleData.order,
          });

          log.debug({ moduleId: module.id, title: module.title }, "Module created");

          // Create lessons for this module
          for (const lessonData of moduleData.lessons) {
            // Find temp file path
            const tempPath = session.tempStoragePaths.find(path => 
              path.includes(lessonData.fileName)
            );

            if (!tempPath) {
              log.warn({ fileName: lessonData.fileName }, "File not found in temp storage");
              continue;
            }

            // Generate structured path
            const typeFolder = lessonData.type === 'VIDEO' ? 'videos' : 
                              lessonData.type === 'PDF' ? 'documents' : 'images';
            const structuredPath = `courses/${course.id}/modules/${module.id}/${typeFolder}/${lessonData.fileName}`;

            // Move file to structured storage (simplified - actual implementation would use S3)
            // await folderUploadService.moveToStructuredStorage(...)

            // Create asset record (simplified - would need actual asset creation)
            // For now, we'll create lesson without asset and add it later
            
            // Create lesson
            const lesson = await lessonRepository.createLesson({
              moduleId: module.id,
              title: lessonData.title,
              description: lessonData.description,
              type: lessonData.type,
              order: lessonData.order,
              assetId: undefined, // TODO: Create asset first
              duration: lessonData.duration,
            });

            log.debug({ lessonId: lesson.id, title: lesson.title }, "Lesson created");

            // Enqueue AI analysis job
            if (lessonData.type === 'VIDEO' || lessonData.type === 'PDF') {
              analysisJobs.push({
                lessonId: lesson.id,
                assetUrl: structuredPath,
                assetType: lessonData.type === 'VIDEO' ? 'VIDEO' : 'PDF',
                metadata: {
                  title: lesson.title,
                  duration: lesson.duration,
                  hasAudio: true,
                },
              });
            }
          }
        }

        // Enqueue all analysis jobs
        const jobIds = await backgroundJobService.enqueueMultipleAnalyses(analysisJobs);

        log.info({ courseId: course.id, jobCount: jobIds.length }, "Analysis jobs enqueued");

        // Mark session as complete
        await sessionRepository.updateSession(sessionId, { status: 'complete' });

        // Delete temporary files (would be done in background)
        // await folderUploadService.deleteTemporaryFiles(session.tempStoragePaths);

        return sendSuccess(res, {
          course: {
            id: course.id,
            name: course.name,
            description: course.description,
          },
          moduleCount: structure.modules.length,
          lessonCount: analysisJobs.length,
          analysisJobIds: jobIds,
        }, 201);
      } catch (error) {
        log.error({ error }, "Failed to create course with structure");
        return next(error);
      }
    }
  );

  return router;
};
