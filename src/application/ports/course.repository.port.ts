import {
  Course,
  CreateCourseInput,
  UpdateCourseInput,
  CourseWithStats,
  CourseListFilters,
  CoursePaginationParams,
} from "../../domain/types/course.types.js";
import { PaginationResult } from "../../domain/types/value-objects.types.js";

export interface CourseRepositoryPort {
  findById: (id: string) => Promise<Course | null>;
  findBySlug: (slug: string) => Promise<Course | null>;
  findByInstructor: (instructorId: string) => Promise<Course[]>;
  findAll: (
    filters: CourseListFilters,
    pagination: CoursePaginationParams
  ) => Promise<PaginationResult<CourseWithStats>>;
  create: (input: CreateCourseInput) => Promise<Course>;
  update: (id: string, input: UpdateCourseInput) => Promise<Course>;
  delete: (id: string) => Promise<void>;
  publish: (id: string) => Promise<Course>;
  archive: (id: string) => Promise<Course>;
  exists: (id: string) => Promise<boolean>;
  getStats: (id: string) => Promise<CourseWithStats | null>;
}
