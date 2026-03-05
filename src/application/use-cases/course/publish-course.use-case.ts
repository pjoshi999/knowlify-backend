import { CourseRepositoryPort } from "../../ports/course.repository.port.js";
import { Course } from "../../../domain/types/course.types.js";
import {
  canPublishCourse,
  transitionCourseStatus,
} from "../../../domain/logic/course.logic.js";
import {
  NotFoundError,
  ValidationError,
} from "../../../domain/errors/domain.errors.js";

export type PublishCourseUseCase = (id: string) => Promise<Course>;

export const createPublishCourseUseCase = (
  courseRepository: CourseRepositoryPort
): PublishCourseUseCase => {
  return async (id: string): Promise<Course> => {
    const course = await courseRepository.findById(id);

    if (!course) {
      throw new NotFoundError("Course not found");
    }

    if (!canPublishCourse(course)) {
      throw new ValidationError(
        "Course cannot be published. Ensure it has a name, description, price, and at least one module."
      );
    }

    // Validate state transition
    transitionCourseStatus(course.status, "PUBLISHED");

    const publishedCourse = await courseRepository.publish(id);
    return publishedCourse;
  };
};
