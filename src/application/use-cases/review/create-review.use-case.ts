import { ReviewRepositoryPort } from "../../ports/review.repository.port.js";
import { EnrollmentRepositoryPort } from "../../ports/enrollment.repository.port.js";
import {
  Review,
  CreateReviewInput,
} from "../../../domain/types/review.types.js";
import { validateRating } from "../../../domain/validation/course.validation.js";
import { canReviewCourse } from "../../../domain/logic/enrollment.logic.js";
import {
  ValidationError,
  NotFoundError,
  DomainError,
} from "../../../domain/errors/domain.errors.js";

export type CreateReviewUseCase = (input: CreateReviewInput) => Promise<Review>;

export const createCreateReviewUseCase = (
  reviewRepository: ReviewRepositoryPort,
  enrollmentRepository: EnrollmentRepositoryPort
): CreateReviewUseCase => {
  return async (input: CreateReviewInput): Promise<Review> => {
    // Validate rating
    if (!validateRating(input.rating)) {
      throw new ValidationError("Rating must be between 1 and 5");
    }

    // Check if student is enrolled
    const enrollment = await enrollmentRepository.findByStudentAndCourse(
      input.studentId,
      input.courseId
    );

    if (!enrollment) {
      throw new NotFoundError("Enrollment not found");
    }

    // Check if student can review
    if (!canReviewCourse(enrollment)) {
      throw new DomainError(
        "You must complete at least one lesson before reviewing"
      );
    }

    // Check if review already exists
    const existingReview = await reviewRepository.findByStudentAndCourse(
      input.studentId,
      input.courseId
    );

    if (existingReview) {
      throw new DomainError("You have already reviewed this course");
    }

    const review = await reviewRepository.create(input);
    return review;
  };
};
