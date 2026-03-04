import { CourseRepositoryPort } from "../../ports/course.repository.port.js";
import { Course } from "../../../domain/types/course.types.js";
import { NotFoundError } from "../../../domain/errors/domain.errors.js";

export type GetCourseUseCase = (id: string) => Promise<Course>;

export const createGetCourseUseCase = (
  courseRepository: CourseRepositoryPort
): GetCourseUseCase => {
  return async (id: string): Promise<Course> => {
    const course = await courseRepository.findById(id);

    if (!course) {
      throw new NotFoundError("Course not found");
    }

    return course;
  };
};
