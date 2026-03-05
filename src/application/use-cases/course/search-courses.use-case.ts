import { CourseRepositoryPort } from "../../ports/course.repository.port.js";
import {
  CourseListFilters,
  CoursePaginationParams,
  CourseWithStats,
} from "../../../domain/types/course.types.js";
import { PaginationResult } from "../../../domain/types/value-objects.types.js";

export type SearchCoursesUseCase = (
  searchQuery: string,
  filters: CourseListFilters,
  pagination: CoursePaginationParams
) => Promise<PaginationResult<CourseWithStats>>;

export const createSearchCoursesUseCase = (
  courseRepository: CourseRepositoryPort
): SearchCoursesUseCase => {
  return async (
    searchQuery: string,
    filters: CourseListFilters,
    pagination: CoursePaginationParams
  ): Promise<PaginationResult<CourseWithStats>> => {
    // Add search query to filters
    const searchFilters: CourseListFilters = {
      ...filters,
      search: searchQuery,
      status: "PUBLISHED", // Only search published courses
    };

    // Get courses from repository
    const result = await courseRepository.findAll(searchFilters, pagination);

    return result;
  };
};
