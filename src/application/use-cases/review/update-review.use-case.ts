import { ReviewRepositoryPort } from "../../ports/review.repository.port.js";
import {
  Review,
  UpdateReviewInput,
} from "../../../domain/types/review.types.js";
import { validateRating } from "../../../domain/validation/course.validation.js";
import {
  ValidationError,
  NotFoundError,
} from "../../../domain/errors/domain.errors.js";

export type UpdateReviewUseCase = (
  id: string,
  input: UpdateReviewInput
) => Promise<Review>;

export const createUpdateReviewUseCase = (
  reviewRepository: ReviewRepositoryPort
): UpdateReviewUseCase => {
  return async (id: string, input: UpdateReviewInput): Promise<Review> => {
    const existingReview = await reviewRepository.findById(id);

    if (!existingReview) {
      throw new NotFoundError("Review not found");
    }

    // Validate rating if provided
    if (input.rating !== undefined && !validateRating(input.rating)) {
      throw new ValidationError("Rating must be between 1 and 5");
    }

    const updatedReview = await reviewRepository.update(id, input);
    return updatedReview;
  };
};
