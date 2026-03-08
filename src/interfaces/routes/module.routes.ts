import {
  Router,
  Request,
  Response,
  NextFunction,
  RequestHandler,
} from "express";
import { ModuleRepository } from "../../infrastructure/repositories/module.repository.js";
import { LessonRepository } from "../../infrastructure/repositories/lesson.repository.js";
import { BackgroundJobService } from "../../infrastructure/services/background-job.service.js";
import { sendSuccess, sendError } from "../utils/response.js";
import { createModuleLogger } from "../../shared/logger.js";

const log = createModuleLogger("module-routes");

interface ModuleRoutesConfig {
  moduleRepository: ModuleRepository;
  lessonRepository: LessonRepository;
  backgroundJobService: BackgroundJobService;
  authenticate: RequestHandler;
  authorizeInstructor: RequestHandler;
}

export const createModuleRoutes = ({
  moduleRepository,
  lessonRepository,
  backgroundJobService,
  authenticate,
  authorizeInstructor,
}: ModuleRoutesConfig): Router => {
  const router = Router();

  /**
   * GET /api/courses/:courseId/modules
   * Get all modules for a course with lessons
   */
  router.get(
    "/courses/:courseId/modules",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const courseId = req.params["courseId"] as string;

        log.info({ courseId }, "Fetching modules for course");

        const modules =
          await moduleRepository.getModulesWithLessonsByCourse(courseId);

        sendSuccess(res, {
          modules,
        });
      } catch (error) {
        log.error({ error }, "Failed to fetch modules");
        next(error);
      }
    }
  );

  /**
   * POST /api/courses/:courseId/modules
   * Create a new module
   */
  router.post(
    "/courses/:courseId/modules",
    authenticate,
    authorizeInstructor,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const courseId = req.params["courseId"] as string;
        const { title, description, order } = req.body;

        log.info({ courseId, title }, "Creating new module");

        // If order not provided, get next available
        const moduleOrder =
          order || (await moduleRepository.getNextOrderNumber(courseId));

        const newModule = await moduleRepository.createModule({
          courseId,
          title,
          description,
          order: moduleOrder,
        });

        sendSuccess(res, { module: newModule }, 201);
      } catch (error) {
        log.error({ error }, "Failed to create module");
        next(error);
      }
    }
  );

  /**
   * PATCH /api/modules/:moduleId
   * Update a module
   */
  router.patch(
    "/modules/:moduleId",
    authenticate,
    authorizeInstructor,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const moduleId = req.params["moduleId"] as string;
        const { title, description, order } = req.body;

        log.info({ moduleId }, "Updating module");

        const updatedModule = await moduleRepository.updateModule(moduleId, {
          title,
          description,
          order,
        });

        sendSuccess(res, { module: updatedModule });
      } catch (error) {
        log.error({ error }, "Failed to update module");
        next(error);
      }
    }
  );

  /**
   * DELETE /api/modules/:moduleId
   * Delete a module (cascade deletes lessons)
   */
  router.delete(
    "/modules/:moduleId",
    authenticate,
    authorizeInstructor,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const moduleId = req.params["moduleId"] as string;

        log.info({ moduleId }, "Deleting module");

        await moduleRepository.deleteModule(moduleId);

        sendSuccess(res, { message: "Module deleted successfully" });
      } catch (error) {
        log.error({ error }, "Failed to delete module");
        next(error);
      }
    }
  );

  /**
   * POST /api/courses/:courseId/modules/reorder
   * Reorder modules
   */
  router.post(
    "/courses/:courseId/modules/reorder",
    authenticate,
    authorizeInstructor,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const courseId = req.params["courseId"] as string;
        const { moduleOrders } = req.body;

        log.info(
          { courseId, count: moduleOrders.length },
          "Reordering modules"
        );

        await moduleRepository.reorderModules(courseId, moduleOrders);

        const modules = await moduleRepository.getModulesByCourse(courseId);

        sendSuccess(res, { modules });
      } catch (error) {
        log.error({ error }, "Failed to reorder modules");
        next(error);
      }
    }
  );

  /**
   * POST /api/modules/:moduleId/lessons
   * Create a new lesson
   */
  router.post(
    "/modules/:moduleId/lessons",
    authenticate,
    authorizeInstructor,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const moduleId = req.params["moduleId"] as string;
        const { title, description, type, order, assetId, duration } = req.body;

        log.info({ moduleId, title }, "Creating new lesson");

        // If order not provided, get next available
        const lessonOrder =
          order || (await lessonRepository.getNextOrderNumber(moduleId));

        const lesson = await lessonRepository.createLesson({
          moduleId,
          title,
          description,
          type,
          order: lessonOrder,
          assetId,
          duration,
        });

        sendSuccess(res, { lesson }, 201);
      } catch (error) {
        log.error({ error }, "Failed to create lesson");
        next(error);
      }
    }
  );

  /**
   * PATCH /api/lessons/:lessonId
   * Update a lesson
   */
  router.patch(
    "/lessons/:lessonId",
    authenticate,
    authorizeInstructor,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const lessonId = req.params["lessonId"] as string;
        const { title, description, type, order, assetId, duration } = req.body;

        log.info({ lessonId }, "Updating lesson");

        const lesson = await lessonRepository.updateLesson(lessonId, {
          title,
          description,
          type,
          order,
          assetId,
          duration,
        });

        sendSuccess(res, { lesson });
      } catch (error) {
        log.error({ error }, "Failed to update lesson");
        next(error);
      }
    }
  );

  /**
   * DELETE /api/lessons/:lessonId
   * Delete a lesson
   */
  router.delete(
    "/lessons/:lessonId",
    authenticate,
    authorizeInstructor,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const lessonId = req.params["lessonId"] as string;

        log.info({ lessonId }, "Deleting lesson");

        await lessonRepository.deleteLesson(lessonId);

        sendSuccess(res, { message: "Lesson deleted successfully" });
      } catch (error) {
        log.error({ error }, "Failed to delete lesson");
        next(error);
      }
    }
  );

  /**
   * POST /api/modules/:moduleId/lessons/reorder
   * Reorder lessons within a module
   */
  router.post(
    "/modules/:moduleId/lessons/reorder",
    authenticate,
    authorizeInstructor,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const moduleId = req.params["moduleId"] as string;
        const { lessonOrders } = req.body;

        log.info(
          { moduleId, count: lessonOrders.length },
          "Reordering lessons"
        );

        await lessonRepository.reorderLessons(moduleId, lessonOrders);

        const lessons = await lessonRepository.getLessonsByModule(moduleId);

        sendSuccess(res, { lessons });
      } catch (error) {
        log.error({ error }, "Failed to reorder lessons");
        next(error);
      }
    }
  );

  /**
   * GET /api/lessons/:lessonId/analysis
   * Get AI analysis for a lesson
   */
  router.get(
    "/lessons/:lessonId/analysis",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const lessonId = req.params["lessonId"] as string;

        log.info({ lessonId }, "Fetching lesson analysis");

        const lesson =
          await lessonRepository.getLessonWithAnalysisById(lessonId);

        if (!lesson) {
          sendError(res, req, {
            statusCode: 404,
            code: "NOT_FOUND",
            message: "Lesson not found",
          });
          return;
        }

        sendSuccess(res, {
          lesson: {
            id: lesson.id,
            title: lesson.title,
            aiAnalysis: lesson.aiAnalysis || null,
          },
        });
      } catch (error) {
        log.error({ error }, "Failed to fetch lesson analysis");
        next(error);
      }
    }
  );

  /**
   * POST /api/lessons/:lessonId/reanalyze
   * Trigger re-analysis of a lesson
   */
  router.post(
    "/lessons/:lessonId/reanalyze",
    authenticate,
    authorizeInstructor,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const lessonId = req.params["lessonId"] as string;

        log.info({ lessonId }, "Triggering lesson re-analysis");

        const lesson =
          await lessonRepository.getLessonWithAnalysisById(lessonId);

        if (!lesson) {
          sendError(res, req, {
            statusCode: 404,
            code: "NOT_FOUND",
            message: "Lesson not found",
          });
          return;
        }

        if (!lesson.assetId) {
          sendError(res, req, {
            statusCode: 400,
            code: "BAD_REQUEST",
            message: "Lesson has no associated asset",
          });
          return;
        }

        // TODO: Fetch asset details to get URL and type
        // For now, we'll need to add this logic when we have the asset repository
        // const asset = await assetRepository.getAssetById(lesson.assetId);

        // Enqueue analysis job
        const jobId = await backgroundJobService.enqueueAnalysis({
          lessonId: lesson.id,
          assetUrl: "", // TODO: Get from asset
          assetType: lesson.type === "VIDEO" ? "VIDEO" : "PDF",
          metadata: {
            title: lesson.title,
            duration: lesson.duration,
            hasAudio: true,
          },
        });

        sendSuccess(res, {
          message: "Re-analysis job enqueued",
          jobId,
          status: "queued",
        });
      } catch (error) {
        log.error({ error }, "Failed to trigger re-analysis");
        next(error);
      }
    }
  );

  return router;
};
