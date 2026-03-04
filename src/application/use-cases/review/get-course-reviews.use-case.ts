import { ReviewRepositoryPort } from "../../ports/review.repository.port.js";
import { Review } from "../../../domain/types/review.types.js";

export type GetCourseReviewsUseCase = (courseId: string) => Promise<Review[]>;

export const createGetCourseReviewsUseCase = (
  reviewRepository: ReviewRepositoryPort
): GetCourseReviewsUseCase => {
  return async (courseId: string): Promise<Review[]> => {
    const reviews = await reviewRepository.findByCourse(courseId);
    return reviews;
  };
};
