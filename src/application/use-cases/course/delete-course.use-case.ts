import { CourseRepositoryPort } from "../../ports/course.repository.port.js";
import { canDeleteCourse } from "../../../domain/logic/course.logic.js";
import {
  NotFoundError,
  ConflictError,
} from "../../../domain/errors/domain.errors.js";

export type DeleteCourseUseCase = (id: string) => Promise<void>;

export const createDeleteCourseUseCase = (
  courseRepository: CourseRepositoryPort
): DeleteCourseUseCase => {
  return async (id: string): Promise<void> => {
    const course = await courseRepository.findById(id);

    if (!course) {
      throw new NotFoundError("Course not found");
    }

    if (!canDeleteCourse(course)) {
      throw new ConflictError("Only draft courses can be deleted");
    }

    await courseRepository.delete(id);
  };
};
