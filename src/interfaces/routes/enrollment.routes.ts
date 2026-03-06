import {
  Router,
  Request,
  Response,
  NextFunction,
  RequestHandler,
} from "express";
import { EnrollmentRepositoryPort } from "../../application/ports/enrollment.repository.port.js";
import { createGetStudentEnrollmentsUseCase } from "../../application/use-cases/enrollment/get-student-enrollments.use-case.js";
import { createUpdateProgressUseCase } from "../../application/use-cases/enrollment/update-progress.use-case.js";
import { UpdateProgressInput } from "../../domain/types/enrollment.types.js";
import { sendSuccess } from "../utils/response.js";
import { createModuleLogger } from "../../shared/logger.js";

const log = createModuleLogger("enrollment-routes");

interface EnrollmentRoutesConfig {
  enrollmentRepository: EnrollmentRepositoryPort;
  authenticate: RequestHandler;
}

export const createEnrollmentRoutes = ({
  enrollmentRepository,
  authenticate,
}: EnrollmentRoutesConfig): Router => {
  const router = Router();

  const getStudentEnrollments =
    createGetStudentEnrollmentsUseCase(enrollmentRepository);
  const updateProgress = createUpdateProgressUseCase(enrollmentRepository);

  // Get student's enrollments
  router.get(
    "/",
    authenticate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const userId = req.user!.id;
        log.info({ userId }, "Fetching enrollments for user");

        const enrollments = await getStudentEnrollments(userId);

        log.info(
          { userId, enrollmentCount: enrollments.length },
          "Enrollments fetched successfully"
        );

        sendSuccess(res, enrollments);
      } catch (error) {
        log.error(
          { err: error, userId: req.user?.id },
          "Error fetching enrollments"
        );
        next(error);
      }
    }
  );

  // Update progress
  router.put(
    "/:id/progress",
    authenticate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const input: UpdateProgressInput = req.body;
        const enrollment = await updateProgress(
          req.params["id"] as string,
          input
        );
        sendSuccess(res, enrollment);
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
};
