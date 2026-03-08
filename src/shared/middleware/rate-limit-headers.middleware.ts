import { Request, Response, NextFunction } from "express";
import { RateLimiter } from "../../application/services/rate-limiter.service";
import { logger } from "../logger";

export function rateLimitHeadersMiddleware(rateLimiter: RateLimiter) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as any).user?.id;
    const tier = (req as any).user?.tier || "standard";

    if (!userId) {
      return next();
    }

    try {
      const status = await rateLimiter.getRateLimitStatus(userId, tier);

      // Set rate limit headers
      res.setHeader("X-RateLimit-Limit", status.apiRequestLimit.toString());
      res.setHeader(
        "X-RateLimit-Remaining",
        (status.apiRequestLimit - status.apiRequestsThisHour).toString()
      );
      res.setHeader(
        "X-RateLimit-Reset",
        new Date(Date.now() + 3600000).toISOString()
      );

      // Add additional headers for upload-specific limits
      if (req.path.includes("/uploads")) {
        res.setHeader(
          "X-Upload-Concurrent-Limit",
          status.maxConcurrentUploads.toString()
        );
        res.setHeader(
          "X-Upload-Concurrent-Used",
          status.concurrentUploads.toString()
        );
        res.setHeader(
          "X-Upload-Daily-Quota",
          status.dailyQuotaLimit.toString()
        );
        res.setHeader("X-Upload-Daily-Used", status.dailyQuotaUsed.toString());
      }

      next();
    } catch (error) {
      logger.error({
        message: "Failed to set rate limit headers",
        error,
        userId,
      });
      // Don't block request if rate limit status check fails
      next();
    }
  };
}
