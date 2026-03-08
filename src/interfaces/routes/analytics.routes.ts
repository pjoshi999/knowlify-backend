import { Router, Request, Response } from "express";
import { AnalyticsService } from "../../application/services/analytics.service";
import { logger } from "../../shared/logger";

export function createAnalyticsRoutes(
  analyticsService: AnalyticsService
): Router {
  const router = Router();

  // GET /api/v1/analytics/instructor/:id
  router.get("/instructor/:id", async (req: Request, res: Response) => {
    try {
      const instructorId = req.params['id'] as string;

      // Verify user has permission to view this instructor's analytics
      // (In production, check if req.user.id === instructorId or user is admin)

      const [storageUsage, uploadSpeed, successRate, recommendations] =
        await Promise.all([
          analyticsService.getInstructorStorageUsage(instructorId),
          analyticsService.getInstructorAverageUploadSpeed(instructorId),
          analyticsService.getInstructorSuccessRate(instructorId),
          analyticsService.generateUploadTimeRecommendations(instructorId),
        ]);

      res.json({
        instructorId,
        storageUsage,
        uploadSpeed,
        successRate,
        recommendations,
      });
    } catch (error) {
      logger.error({ message: "Failed to get instructor analytics", 
        error,
        instructorId: req.params['id'],
      });
      res.status(500).json({
        error: "Failed to retrieve instructor analytics",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // GET /api/v1/analytics/course/:id
  router.get("/course/:id", async (req: Request, res: Response) => {
    try {
      const courseId = req.params['id'] as string;

      // Verify user has permission to view this course's analytics
      // (In production, check if user owns the course or is admin)

      const [costBreakdown, transcodingMetrics] = await Promise.all([
        analyticsService.getCourseStorageCostBreakdown(courseId),
        analyticsService.getTranscodingQueueAndProcessingTime(),
      ]);

      res.json({
        courseId,
        costBreakdown,
        transcodingMetrics,
      });
    } catch (error) {
      logger.error({ message: "Failed to get course analytics", 
        error,
        courseId: req.params['id'],
      });
      res.status(500).json({
        error: "Failed to retrieve course analytics",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  return router;
}
