import { CourseRepositoryPort } from "../../ports/course.repository.port.js";
import {
  Course,
  CreateCourseInput,
} from "../../../domain/types/course.types.js";
import {
  validateCourseName,
  validateCourseDescription,
  validatePrice,
} from "../../../domain/validation/course.validation.js";
import { generateUrlSlug } from "../../../domain/logic/course.logic.js";
import { ValidationError } from "../../../domain/errors/domain.errors.js";

export type CreateCourseUseCase = (input: CreateCourseInput) => Promise<Course>;

export const createCreateCourseUseCase = (
  courseRepository: CourseRepositoryPort
): CreateCourseUseCase => {
  return async (input: CreateCourseInput): Promise<Course> => {
    // Validate inputs
    const nameError = validateCourseName(input.name);
    if (nameError) {
      throw new ValidationError(nameError);
    }

    const descriptionError = validateCourseDescription(input.description);
    if (descriptionError) {
      throw new ValidationError(descriptionError);
    }

    const priceError = validatePrice(input.priceAmount);
    if (priceError) {
      throw new ValidationError(priceError);
    }

    // Generate URL slug with uniqueness guarantee
    let urlSlug = generateUrlSlug(input.name);
    let existingCourse = await courseRepository.findBySlug(urlSlug);

    // If slug exists, append a timestamp to make it unique
    if (existingCourse) {
      const timestamp = Date.now();
      urlSlug = `${urlSlug}-${timestamp}`;

      // Double-check the new slug doesn't exist (extremely unlikely)
      existingCourse = await courseRepository.findBySlug(urlSlug);
      if (existingCourse) {
        throw new ValidationError(
          "Failed to generate unique course identifier. Please try again."
        );
      }
    }

    // Create course with default values
    const courseInput: CreateCourseInput = {
      ...input,
      priceCurrency: input.priceCurrency || "USD",
      manifest: input.manifest || { modules: [] },
    };

    const course = await courseRepository.create(courseInput);
    return course;
  };
};
