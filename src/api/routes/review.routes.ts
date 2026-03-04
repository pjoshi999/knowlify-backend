import {
  Router,
  Request,
  Response,
  NextFunction,
  RequestHandler,
} from "express";
import { ReviewRepositoryPort } from "../../application/ports/review.repository.port.js";
import { EnrollmentRepositoryPort } from "../../application/ports/enrollment.repository.port.js";
import { createCreateReviewUseCase } from "../../application/use-cases/review/create-review.use-case.js";
import { createUpdateReviewUseCase } from "../../application/use-cases/review/update-review.use-case.js";
import { createDeleteReviewUseCase } from "../../application/use-cases/review/delete-review.use-case.js";
import { createGetCourseReviewsUseCase } from "../../application/use-cases/review/get-course-reviews.use-case.js";
import {
  CreateReviewInput,
  UpdateReviewInput,
} from "../../domain/types/review.types.js";

interface ReviewRoutesConfig {
  reviewRepository: ReviewRepositoryPort;
  enrollmentRepository: EnrollmentRepositoryPort;
  authenticate: RequestHandler;
}

export const createReviewRoutes = ({
  reviewRepository,
  enrollmentRepository,
  authenticate,
}: ReviewRoutesConfig): Router => {
  const router = Router();

  const createReview = createCreateReviewUseCase(
    reviewRepository,
    enrollmentRepository
  );
  const updateReview = createUpdateReviewUseCase(reviewRepository);
  const deleteReview = createDeleteReviewUseCase(reviewRepository);
  const getCourseReviews = createGetCourseReviewsUseCase(reviewRepository);

  // Get course reviews (public)
  router.get(
    "/courses/:courseId",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const reviews = await getCourseReviews(
          req.params["courseId"] as string
        );
        res.json({ success: true, data: reviews });
      } catch (error) {
        next(error);
      }
    }
  );

  // Create review (authenticated)
  router.post(
    "/",
    authenticate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const input: CreateReviewInput = {
          ...req.body,
          studentId: req.user!.id,
        };
        const review = await createReview(input);
        res.status(201).json({ success: true, data: review });
      } catch (error) {
        next(error);
      }
    }
  );

  // Update review (authenticated)
  router.put(
    "/:id",
    authenticate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const input: UpdateReviewInput = req.body;
        const review = await updateReview(req.params["id"] as string, input);
        res.json({ success: true, data: review });
      } catch (error) {
        next(error);
      }
    }
  );

  // Delete review (authenticated)
  router.delete(
    "/:id",
    authenticate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await deleteReview(req.params["id"] as string);
        res.json({ success: true, data: { message: "Review deleted" } });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
};
