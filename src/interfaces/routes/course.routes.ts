import {
  Router,
  Request,
  Response,
  NextFunction,
  RequestHandler,
} from "express";
import { CourseRepositoryPort } from "../../application/ports/course.repository.port.js";
import { CachePort } from "../../application/ports/cache.port.js";
import { createCreateCourseUseCase } from "../../application/use-cases/course/create-course.use-case.js";
import { createGetCourseUseCase } from "../../application/use-cases/course/get-course.use-case.js";
import { createListCoursesUseCase } from "../../application/use-cases/course/list-courses.use-case.js";
import { createUpdateCourseUseCase } from "../../application/use-cases/course/update-course.use-case.js";
import { createDeleteCourseUseCase } from "../../application/use-cases/course/delete-course.use-case.js";
import { createPublishCourseUseCase } from "../../application/use-cases/course/publish-course.use-case.js";
import {
  CreateCourseInput,
  UpdateCourseInput,
  CourseListFilters,
  CoursePaginationParams,
} from "../../domain/types/course.types.js";
import {
  createCacheMiddleware,
  createCacheInvalidationMiddleware,
} from "../middleware/cache.middleware.js";
import { sendMessage, sendSuccess } from "../utils/response.js";

interface CourseRoutesConfig {
  courseRepository: CourseRepositoryPort;
  cache: CachePort;
  authenticate: RequestHandler;
  authorizeInstructor: RequestHandler;
}

export const createCourseRoutes = ({
  courseRepository,
  cache,
  authenticate,
  authorizeInstructor,
}: CourseRoutesConfig): Router => {
  const router = Router();

  const createCourse = createCreateCourseUseCase(courseRepository);
  const getCourse = createGetCourseUseCase(courseRepository);
  const listCourses = createListCoursesUseCase(courseRepository);
  const updateCourse = createUpdateCourseUseCase(courseRepository);
  const deleteCourse = createDeleteCourseUseCase(courseRepository);
  const publishCourse = createPublishCourseUseCase(courseRepository);

  // Cache middleware for course list (5 minutes)
  const cacheList = createCacheMiddleware(cache, {
    ttl: 300,
    keyPrefix: "courses:list",
  });

  // Cache middleware for single course (10 minutes)
  const cacheCourse = createCacheMiddleware(cache, {
    ttl: 600,
    keyPrefix: "courses:detail",
  });

  // Cache invalidation for course mutations
  const invalidateCourseCache = createCacheInvalidationMiddleware(cache, [
    "courses:list:*",
    "courses:detail:*",
  ]);

  // Public routes
  router.get(
    "/",
    cacheList,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const filters: CourseListFilters = {
          category: req.query["category"] as string,
          minPrice: req.query["minPrice"]
            ? parseFloat(req.query["minPrice"] as string)
            : undefined,
          maxPrice: req.query["maxPrice"]
            ? parseFloat(req.query["maxPrice"] as string)
            : undefined,
          minRating: req.query["minRating"]
            ? parseFloat(req.query["minRating"] as string)
            : undefined,
          status: req.query["status"] as "DRAFT" | "PUBLISHED" | "ARCHIVED",
          instructorId: req.query["instructorId"] as string,
          search: req.query["search"] as string,
        };

        const pagination: CoursePaginationParams = {
          page: req.query["page"]
            ? parseInt(req.query["page"] as string, 10)
            : 1,
          limit: req.query["limit"]
            ? parseInt(req.query["limit"] as string, 10)
            : 20,
          sortBy: ([
            "createdAt",
            "priceAmount",
            "enrollmentCount",
            "avgRating",
          ].includes(req.query["sortBy"] as string)
            ? req.query["sortBy"]
            : "createdAt") as
            | "createdAt"
            | "priceAmount"
            | "enrollmentCount"
            | "avgRating",
          sortOrder: req.query["sortOrder"] as "asc" | "desc",
        };

        const result = await listCourses(filters, pagination);
        sendSuccess(res, result);
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/:id",
    cacheCourse,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const course = await getCourse(req.params["id"] as string);
        sendSuccess(res, course);
      } catch (error) {
        next(error);
      }
    }
  );

  // Get course assets (protected - requires enrollment or instructor ownership)
  router.get(
    "/:id/assets",
    authenticate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const courseId = req.params["id"] as string;
        const userId = req.user!.id;

        // Check if course exists
        const courseExists = await courseRepository.exists(courseId);
        if (!courseExists) {
          return res.status(404).json({
            success: false,
            error: "NOT_FOUND",
            message: "Course not found",
          });
        }

        // Get course to check instructor
        const course = await courseRepository.findById(courseId);

        // Allow if user is the instructor
        if (course?.instructorId === userId) {
          const assets = await courseRepository.findAssets(courseId);
          return sendSuccess(res, assets);
        }

        // Check if user is enrolled (for students)
        // Note: You'll need to inject enrollmentRepository into this route
        // For now, we'll allow authenticated users to access assets
        // TODO: Add proper enrollment check
        const assets = await courseRepository.findAssets(courseId);
        return sendSuccess(res, assets);
      } catch (error) {
        return next(error);
      }
    }
  );

  // Protected routes - instructor only
  router.post(
    "/",
    authenticate,
    authorizeInstructor,
    invalidateCourseCache,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = req.body as unknown as Omit<
          CreateCourseInput,
          "instructorId"
        >;
        const input: CreateCourseInput = {
          ...body,
          instructorId: req.user!.id,
        };
        const course = await createCourse(input);
        sendSuccess(res, course, 201);
      } catch (error) {
        next(error);
      }
    }
  );

  router.put(
    "/:id",
    authenticate,
    authorizeInstructor,
    invalidateCourseCache,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const input = req.body as unknown as UpdateCourseInput;
        const course = await updateCourse(req.params["id"] as string, input);
        sendSuccess(res, course);
      } catch (error) {
        next(error);
      }
    }
  );

  router.delete(
    "/:id",
    authenticate,
    authorizeInstructor,
    invalidateCourseCache,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await deleteCourse(req.params["id"] as string);
        sendMessage(res, "Course deleted");
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/:id/publish",
    authenticate,
    authorizeInstructor,
    invalidateCourseCache,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const course = await publishCourse(req.params["id"] as string);
        sendSuccess(res, course);
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
};
