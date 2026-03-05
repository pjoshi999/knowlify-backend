import { EnrollmentRepositoryPort } from "../../ports/enrollment.repository.port.js";
import { CourseRepositoryPort } from "../../ports/course.repository.port.js";
import {
  Enrollment,
  CreateEnrollmentInput,
} from "../../../domain/types/enrollment.types.js";
import { canEnrollInCourse } from "../../../domain/logic/enrollment.logic.js";
import {
  NotFoundError,
  ConflictError,
} from "../../../domain/errors/domain.errors.js";

export type CreateEnrollmentUseCase = (
  input: CreateEnrollmentInput
) => Promise<Enrollment>;

export const createCreateEnrollmentUseCase = (
  enrollmentRepository: EnrollmentRepositoryPort,
  courseRepository: CourseRepositoryPort
): CreateEnrollmentUseCase => {
  return async (input: CreateEnrollmentInput): Promise<Enrollment> => {
    // Check if course exists
    const course = await courseRepository.findById(input.courseId);
    if (!course) {
      throw new NotFoundError("Course not found");
    }

    // Check if already enrolled
    const existingEnrollment =
      await enrollmentRepository.findByStudentAndCourse(
        input.studentId,
        input.courseId
      );

    // Check enrollment eligibility
    if (!canEnrollInCourse(course, existingEnrollment)) {
      throw new ConflictError(
        "Cannot enroll in this course. It may not be published or you may already be enrolled."
      );
    }

    const enrollment = await enrollmentRepository.create(input);
    return enrollment;
  };
};
