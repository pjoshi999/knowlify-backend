import {
  Router,
  Request,
  Response,
  NextFunction,
  RequestHandler,
} from "express";
import { CourseRepositoryPort } from "../../application/ports/course.repository.port.js";
import { CachePort } from "../../application/ports/cache.port.js";
import { createGetInstructorStatsUseCase } from "../../application/use-cases/instructor/get-instructor-stats.use-case.js";
import { createCacheMiddleware } from "../middleware/cache.middleware.js";
import { sendSuccess } from "../utils/response.js";

interface InstructorRoutesConfig {
  courseRepository: CourseRepositoryPort;
  cache: CachePort;
  authenticate: RequestHandler;
  requireRole: (role: string) => RequestHandler;
}

export const createInstructorRoutes = ({
  courseRepository,
  cache,
  authenticate,
  requireRole,
}: InstructorRoutesConfig): Router => {
  const router = Router();

  const getInstructorStats = createGetInstructorStatsUseCase(courseRepository);

  // Cache instructor stats for 5 minutes
  const cacheStats = createCacheMiddleware(cache, {
    ttl: 300,
    keyPrefix: "instructor:stats",
    varyBy: ["user.id"],
  });

  // Get instructor dashboard stats
  router.get(
    "/stats",
    authenticate,
    requireRole("INSTRUCTOR"),
    cacheStats,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const stats = await getInstructorStats(req.user!.id);
        sendSuccess(res, stats);
      } catch (error) {
        next(error);
      }
    }
  );

  // Get instructor's courses
  router.get(
    "/courses",
    authenticate,
    requireRole("INSTRUCTOR"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const page = req.query["page"]
          ? parseInt(req.query["page"] as string, 10)
          : 1;
        const limit = req.query["limit"]
          ? parseInt(req.query["limit"] as string, 10)
          : 20;

        const courses = await courseRepository.findAll(
          { instructorId: req.user!.id },
          { page, limit }
        );

        sendSuccess(res, courses);
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
};
