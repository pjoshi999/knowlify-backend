import { CourseRepositoryPort } from "../../ports/course.repository.port.js";
import {
  CourseWithStats,
  CourseListFilters,
  CoursePaginationParams,
} from "../../../domain/types/course.types.js";
import { PaginationResult } from "../../../domain/types/value-objects.types.js";

export type ListCoursesUseCase = (
  filters: CourseListFilters,
  pagination: CoursePaginationParams
) => Promise<PaginationResult<CourseWithStats>>;

export const createListCoursesUseCase = (
  courseRepository: CourseRepositoryPort
): ListCoursesUseCase => {
  return async (
    filters: CourseListFilters,
    pagination: CoursePaginationParams
  ): Promise<PaginationResult<CourseWithStats>> => {
    // Set defaults
    const paginationParams: CoursePaginationParams = {
      page: pagination.page || 1,
      limit: Math.min(pagination.limit || 20, 100), // Max 100 per page
      sortBy: pagination.sortBy || "createdAt",
      sortOrder: pagination.sortOrder || "desc",
    };

    const result = await courseRepository.findAll(filters, paginationParams);
    return result;
  };
};
