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
    if (!validateCourseName(input.name)) {
      throw new ValidationError("Invalid course name");
    }

    if (!validateCourseDescription(input.description)) {
      throw new ValidationError("Invalid course description");
    }

    const priceError = validatePrice(input.priceAmount);
    if (priceError) {
      throw new ValidationError(priceError);
    }

    // Generate URL slug
    const urlSlug = generateUrlSlug(input.name);

    // Check if slug already exists
    const existingCourse = await courseRepository.findBySlug(urlSlug);
    if (existingCourse) {
      throw new ValidationError(
        "A course with this name already exists. Please choose a different name."
      );
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
