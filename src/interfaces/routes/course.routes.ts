import {
  Router,
  Request,
  Response,
  NextFunction,
  RequestHandler,
} from "express";
import multer from "multer";
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
import { createModuleLogger } from "../../shared/logger.js";

const log = createModuleLogger("course-routes");

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for thumbnails
  },
  fileFilter: (_req, file, cb) => {
    // Accept images only
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("Only image files are allowed for thumbnails"));
      return;
    }
    cb(null, true);
  },
});

interface CourseRoutesConfig {
  courseRepository: CourseRepositoryPort;
  cache: CachePort;
  authenticate: RequestHandler;
  authorizeInstructor: RequestHandler;
  enrollmentRepository?: any; // Add enrollment repository
  storageAdapter?: any; // Add storage adapter for file uploads
}

export const createCourseRoutes = ({
  courseRepository,
  cache,
  authenticate,
  authorizeInstructor,
  enrollmentRepository,
  storageAdapter,
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

  // Optional authentication middleware - doesn't fail if no token
  const optionalAuth: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    // Only try to authenticate if there's an authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
      authenticate(req, res, (err) => {
        // Continue regardless of authentication result
        // If authentication fails, req.user will remain undefined
        if (err) {
          log.warn({ error: err.message }, "Optional authentication failed, continuing without user");
        }
        next();
      });
    } else {
      // No authorization header, continue without setting req.user
      next();
    }
  };

  router.get(
    "/:id",
    optionalAuth,
    cacheCourse,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const courseId = req.params["id"] as string;
        const course = await getCourse(courseId);
        
        // Check enrollment status if user is authenticated
        let isEnrolled = false;
        let progress = 0;
        let enrollmentId: string | undefined;
        
        log.info({ 
          userId: req.user?.id, 
          hasUser: !!req.user, 
          hasAuthHeader: !!req.headers.authorization,
          courseId 
        }, "Checking enrollment status");
        
        if (req.user && enrollmentRepository) {
          try {
            const enrollment = await enrollmentRepository.findByStudentAndCourse(
              req.user.id,
              courseId
            );
            
            if (enrollment) {
              isEnrolled = true;
              enrollmentId = enrollment.id;
              
              // Calculate progress from completed lessons
              const manifest = course.manifest as any;
              if (manifest?.modules && enrollment.progress) {
                const totalLessons = manifest.modules.reduce(
                  (sum: number, module: any) => sum + (module.lessons?.length || 0),
                  0
                );
                
                const completedLessons = enrollment.progress.completedLessons?.length || 0;
                
                if (totalLessons > 0) {
                  progress = Math.round((completedLessons / totalLessons) * 100);
                }
              }
            }
          } catch (error) {
            log.warn({ userId: req.user.id, courseId, error }, "Failed to check enrollment status");
          }
        }
        
        log.info({ 
          userId: req.user?.id, 
          isEnrolled, 
          progress, 
          enrollmentId,
          courseId 
        }, "Enrollment check complete");
        
        sendSuccess(res, {
          ...course,
          isEnrolled,
          progress,
          enrollmentId,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // Check if user has access to course (enrolled or instructor)
  router.get(
    "/:id/access",
    authenticate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const courseId = req.params["id"] as string;
        const userId = req.user!.id;

        // Check if course exists
        const course = await courseRepository.findById(courseId);
        if (!course) {
          return res.status(404).json({
            success: false,
            error: "NOT_FOUND",
            message: "Course not found",
          });
        }

        // Check if user is the instructor
        if (course.instructorId === userId) {
          return sendSuccess(res, {
            hasAccess: true,
            reason: "instructor",
            course: {
              id: course.id,
              name: course.name,
              manifest: course.manifest,
            },
          });
        }

        // Check if user is enrolled
        if (enrollmentRepository) {
          const enrollment = await enrollmentRepository.findByStudentAndCourse(
            userId,
            courseId
          );

          if (enrollment) {
            return sendSuccess(res, {
              hasAccess: true,
              reason: "enrolled",
              enrollmentId: enrollment.id,
              progress: enrollment.progress,
              course: {
                id: course.id,
                name: course.name,
                manifest: course.manifest,
              },
            });
          }
        }

        // No access
        return sendSuccess(res, {
          hasAccess: false,
          reason: "not_enrolled",
          course: {
            id: course.id,
            name: course.name,
          },
        });
      } catch (error) {
        return next(error);
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
        const course = await courseRepository.findById(courseId);
        if (!course) {
          return res.status(404).json({
            success: false,
            error: "NOT_FOUND",
            message: "Course not found",
          });
        }

        // Check if user is the instructor
        const isInstructor = course.instructorId === userId;

        // Check if user is enrolled
        let isEnrolled = false;
        if (enrollmentRepository) {
          const enrollment = await enrollmentRepository.findByStudentAndCourse(
            userId,
            courseId
          );
          isEnrolled = !!enrollment;
        }

        // Deny access if not instructor and not enrolled
        if (!isInstructor && !isEnrolled) {
          log.warn(
            { userId, courseId },
            "User attempted to access course assets without enrollment"
          );
          return res.status(403).json({
            success: false,
            error: "FORBIDDEN",
            message:
              "You must be enrolled in this course to access its content",
          });
        }

        // Get assets from course_assets table
        let assets = await courseRepository.findAssets(courseId);

        // Fallback: If no assets in course_assets table, extract from manifest
        if (assets.length === 0 && course.manifest) {
          log.info(
            { userId, courseId },
            "No assets in course_assets table, extracting from manifest"
          );

          const manifestAssets: any[] = [];
          const manifest = course.manifest as any;

          // Extract videos from manifest modules
          if (manifest.modules && Array.isArray(manifest.modules)) {
            for (const manifestModule of manifest.modules) {
              if (
                manifestModule.lessons &&
                Array.isArray(manifestModule.lessons)
              ) {
                for (const lesson of manifestModule.lessons) {
                  if (lesson.videoUrl) {
                    manifestAssets.push({
                      id: lesson.id || `video-${lesson.title}`,
                      courseId: courseId,
                      assetType: "VIDEO",
                      fileName:
                        lesson.videoUrl.split("/").pop() || lesson.title,
                      fileSize: 0, // Unknown from manifest
                      storagePath: lesson.videoUrl,
                      mimeType: "video/mp4",
                      duration: lesson.duration || undefined,
                      metadata: {
                        lessonId: lesson.id,
                        lessonTitle: lesson.title,
                        moduleTitle: manifestModule.title,
                      },
                      createdAt: course.createdAt,
                    });
                  }
                }
              }
            }
          }

          assets = manifestAssets;
        }

        log.info(
          {
            userId,
            courseId,
            assetCount: assets.length,
            isInstructor,
            fromManifest: assets.length > 0 && !course.manifest,
          },
          "User accessed course assets"
        );

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
    upload.single("thumbnail"),
    invalidateCourseCache,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = req.body as unknown as Omit<
          CreateCourseInput,
          "instructorId"
        >;

        let thumbnailUrl: string | undefined = body.thumbnailUrl;

        // If thumbnail file is uploaded, upload to S3
        if (req.file && storageAdapter) {
          const fileName = `thumbnails/${Date.now()}-${req.file.originalname}`;
          const uploadResult = await storageAdapter.uploadFile({
            file: req.file.buffer,
            fileName,
            mimeType: req.file.mimetype,
          });
          thumbnailUrl = uploadResult.url;
          log.info({ fileName, url: thumbnailUrl }, "Thumbnail uploaded to S3");
        }

        // Parse priceAmount as number if it's a string (from FormData)
        const priceAmount =
          typeof body.priceAmount === "string"
            ? parseInt(body.priceAmount, 10)
            : body.priceAmount;

        const input: CreateCourseInput = {
          ...body,
          instructorId: req.user!.id,
          thumbnailUrl,
          priceAmount,
        };

        log.info(
          {
            name: input.name,
            hasManifest: !!input.manifest,
            hasThumbnail: !!thumbnailUrl,
            moduleCount: input.manifest?.modules?.length || 0,
          },
          "Creating course"
        );

        const course = await createCourse(input);

        log.info(
          {
            courseId: course.id,
            moduleCount: course.manifest?.modules?.length || 0,
          },
          "Course created successfully"
        );

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
