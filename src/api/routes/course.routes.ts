import {
  Router,
  Request,
  Response,
  NextFunction,
  RequestHandler,
} from "express";
import { CourseRepositoryPort } from "../../application/ports/course.repository.port.js";
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

interface CourseRoutesConfig {
  courseRepository: CourseRepositoryPort;
  authenticate: RequestHandler;
  authorizeInstructor: RequestHandler;
}

export const createCourseRoutes = ({
  courseRepository,
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

  // Public routes
  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
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
        page: req.query["page"] ? parseInt(req.query["page"] as string, 10) : 1,
        limit: req.query["limit"]
          ? parseInt(req.query["limit"] as string, 10)
          : 20,
        sortBy: req.query["sortBy"] as
          | "createdAt"
          | "priceAmount"
          | "enrollmentCount"
          | "avgRating",
        sortOrder: req.query["sortOrder"] as "asc" | "desc",
      };

      const result = await listCourses(filters, pagination);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  });

  router.get(
    "/:id",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const course = await getCourse(req.params["id"] as string);
        res.json({ success: true, data: course });
      } catch (error) {
        next(error);
      }
    }
  );

  // Protected routes - instructor only
  router.post(
    "/",
    authenticate,
    authorizeInstructor,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const input: CreateCourseInput = {
          ...req.body,
          instructorId: req.user!.id,
        };
        const course = await createCourse(input);
        res.status(201).json({ success: true, data: course });
      } catch (error) {
        next(error);
      }
    }
  );

  router.put(
    "/:id",
    authenticate,
    authorizeInstructor,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const input: UpdateCourseInput = req.body;
        const course = await updateCourse(req.params["id"] as string, input);
        res.json({ success: true, data: course });
      } catch (error) {
        next(error);
      }
    }
  );

  router.delete(
    "/:id",
    authenticate,
    authorizeInstructor,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await deleteCourse(req.params["id"] as string);
        res.json({ success: true, data: { message: "Course deleted" } });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/:id/publish",
    authenticate,
    authorizeInstructor,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const course = await publishCourse(req.params["id"] as string);
        res.json({ success: true, data: course });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
};
