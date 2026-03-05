import { Router, Request, Response, NextFunction } from "express";
import { CourseRepositoryPort } from "../../application/ports/course.repository.port.js";
import { CachePort } from "../../application/ports/cache.port.js";
import { createSearchCoursesUseCase } from "../../application/use-cases/course/search-courses.use-case.js";
import { createCacheMiddleware } from "../middleware/cache.middleware.js";
import {
  CourseListFilters,
  CoursePaginationParams,
} from "../../domain/types/course.types.js";
import { sendSuccess } from "../utils/response.js";

interface SearchRoutesConfig {
  courseRepository: CourseRepositoryPort;
  cache: CachePort;
}

export const createSearchRoutes = ({
  courseRepository,
  cache,
}: SearchRoutesConfig): Router => {
  const router = Router();

  const searchCourses = createSearchCoursesUseCase(courseRepository);

  // Cache search results for 5 minutes
  const cacheSearch = createCacheMiddleware(cache, {
    ttl: 300,
    keyPrefix: "search:courses",
  });

  // Search suggestions (lightweight autocomplete)
  router.get(
    "/suggestions",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const query = (req.query["q"] as string) || "";

        const result = await courseRepository.findAll(
          { search: query, status: "PUBLISHED" },
          { page: 1, limit: 10, sortBy: "enrollmentCount", sortOrder: "desc" }
        );

        const suggestions = result.data.map((course) => ({
          id: course.id,
          name: course.name,
          category: course.category,
          urlSlug: course.urlSlug,
        }));

        sendSuccess(res, suggestions);
      } catch (error) {
        next(error);
      }
    }
  );

  // Search courses
  router.get(
    "/courses",
    cacheSearch,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const query = (req.query["q"] as string) || "";

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
        };

        const pagination: CoursePaginationParams = {
          page: req.query["page"]
            ? parseInt(req.query["page"] as string, 10)
            : 1,
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

        const result = await searchCourses(query, filters, pagination);
        sendSuccess(res, result);
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
};
