import { CourseRepositoryPort } from "../../ports/course.repository.port.js";
import {
  Course,
  UpdateCourseInput,
} from "../../../domain/types/course.types.js";
import {
  validateCourseName,
  validateCourseDescription,
  validatePrice,
} from "../../../domain/validation/course.validation.js";
import { canUpdateCourse } from "../../../domain/logic/course.logic.js";
import {
  ValidationError,
  NotFoundError,
  ConflictError,
} from "../../../domain/errors/domain.errors.js";

export type UpdateCourseUseCase = (
  id: string,
  input: UpdateCourseInput
) => Promise<Course>;

export const createUpdateCourseUseCase = (
  courseRepository: CourseRepositoryPort
): UpdateCourseUseCase => {
  return async (id: string, input: UpdateCourseInput): Promise<Course> => {
    // Get existing course
    const existingCourse = await courseRepository.findById(id);
    if (!existingCourse) {
      throw new NotFoundError("Course not found");
    }

    // Check if course can be updated
    if (!canUpdateCourse(existingCourse)) {
      throw new ConflictError("Cannot update archived course");
    }

    // Validate inputs if provided
    if (input.name !== undefined) {
      const nameError = validateCourseName(input.name);
      if (nameError) {
        throw new ValidationError(nameError);
      }
    }

    if (input.description !== undefined) {
      const descriptionError = validateCourseDescription(input.description);
      if (descriptionError) {
        throw new ValidationError(descriptionError);
      }
    }

    if (input.priceAmount !== undefined) {
      const priceError = validatePrice(input.priceAmount);
      if (priceError) {
        throw new ValidationError(priceError);
      }
    }

    const updatedCourse = await courseRepository.update(id, input);
    return updatedCourse;
  };
};
