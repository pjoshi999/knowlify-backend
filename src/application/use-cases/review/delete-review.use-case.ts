import { ReviewRepositoryPort } from "../../ports/review.repository.port.js";
import { NotFoundError } from "../../../domain/errors/domain.errors.js";

export type DeleteReviewUseCase = (id: string) => Promise<void>;

export const createDeleteReviewUseCase = (
  reviewRepository: ReviewRepositoryPort
): DeleteReviewUseCase => {
  return async (id: string): Promise<void> => {
    const review = await reviewRepository.findById(id);

    if (!review) {
      throw new NotFoundError("Review not found");
    }

    await reviewRepository.delete(id);
  };
};
