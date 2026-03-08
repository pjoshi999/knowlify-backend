import {
  ConcurrentUploadLimitError,
  DailyQuotaExceededError,
  RateLimitError,
} from "@shared/errors/upload-errors.js";
import { logger } from "@shared/logger.js";
import { RedisClient } from "@infrastructure/cache/redis-types.js";

export type InstructorTier = "premium" | "standard" | "free";

export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  retryAfter?: number;
}

export interface RateLimitStatus {
  concurrentUploads: number;
  maxConcurrentUploads: number;
  dailyQuotaUsed: number;
  dailyQuotaLimit: number;
  apiRequestsThisHour: number;
  apiRequestLimit: number;
}

export class RateLimiter {
  private readonly MAX_CONCURRENT_UPLOADS = 5;
  private readonly DAILY_QUOTA_GB: Record<InstructorTier, number> = {
    premium: 2000,
    standard: 500,
    free: 100,
  };
  private readonly API_RATE_LIMIT: Record<InstructorTier, number> = {
    premium: 5000,
    standard: 1000,
    free: 500,
  };
  private readonly TOKEN_BUCKET_REFILL_GB_PER_HOUR = 10;
  private readonly PRESIGNED_URL_LIMIT = 100;

  constructor(private redisClient: RedisClient) {}

  async canStartUpload(
    instructorId: string,
    tier: InstructorTier
  ): Promise<RateLimitResult> {
    try {
      // Check concurrent uploads
      const concurrentKey = `upload:concurrent:${instructorId}`;
      const concurrentCount = await this.redisClient.sCard(concurrentKey);

      if (concurrentCount >= this.MAX_CONCURRENT_UPLOADS) {
        return {
          allowed: false,
          reason: `Maximum ${this.MAX_CONCURRENT_UPLOADS} concurrent uploads allowed`,
          retryAfter: 60,
        };
      }

      // Check daily quota
      const quotaKey = `upload:quota:${instructorId}:${this.getCurrentDate()}`;
      const quotaUsed = parseInt(
        (await this.redisClient.get(quotaKey)) || "0",
        10
      );
      const quotaLimit = this.DAILY_QUOTA_GB[tier] * 1024 * 1024 * 1024; // Convert GB to bytes

      if (quotaUsed >= quotaLimit) {
        const secondsUntilMidnight = this.getSecondsUntilMidnight();
        return {
          allowed: false,
          reason: `Daily upload quota of ${this.DAILY_QUOTA_GB[tier]}GB exceeded`,
          retryAfter: secondsUntilMidnight,
        };
      }

      return { allowed: true };
    } catch (error) {
      logger.error({ message: "Failed to check upload limits",  error, instructorId });
      // Fail open - allow upload if Redis is down
      return { allowed: true };
    }
  }

  async acquireUploadSlot(
    instructorId: string,
    sessionId: string
  ): Promise<boolean> {
    try {
      const concurrentKey = `upload:concurrent:${instructorId}`;
      const count = await this.redisClient.sCard(concurrentKey);

      if (count >= this.MAX_CONCURRENT_UPLOADS) {
        throw new ConcurrentUploadLimitError(
          count,
          this.MAX_CONCURRENT_UPLOADS
        );
      }

      // Add session to concurrent uploads set
      await this.redisClient.sAdd(concurrentKey, sessionId);

      // Set expiry to prevent leaks (7 days)
      await this.redisClient.expire(concurrentKey, 7 * 24 * 60 * 60);

      logger.info({ message: "Acquired upload slot", 
        instructorId,
        sessionId,
        concurrentCount: count + 1,
      });

      return true;
    } catch (error) {
      if (error instanceof ConcurrentUploadLimitError) {
        throw error;
      }

      logger.error({ message: "Failed to acquire upload slot", 
        error,
        instructorId,
        sessionId,
      });
      return false;
    }
  }

  async releaseUploadSlot(
    instructorId: string,
    sessionId: string
  ): Promise<void> {
    try {
      const concurrentKey = `upload:concurrent:${instructorId}`;
      await this.redisClient.sRem(concurrentKey, sessionId);

      logger.info({ message: "Released upload slot",  instructorId, sessionId });
    } catch (error) {
      logger.error({ message: "Failed to release upload slot", 
        error,
        instructorId,
        sessionId,
      });
    }
  }

  async checkDailyQuota(
    instructorId: string,
    tier: InstructorTier,
    bytesToUpload: number
  ): Promise<boolean> {
    try {
      const quotaKey = `upload:quota:${instructorId}:${this.getCurrentDate()}`;
      const quotaUsed = parseInt(
        (await this.redisClient.get(quotaKey)) || "0",
        10
      );
      const quotaLimit = this.DAILY_QUOTA_GB[tier] * 1024 * 1024 * 1024;

      if (quotaUsed + bytesToUpload > quotaLimit) {
        const secondsUntilMidnight = this.getSecondsUntilMidnight();
        throw new DailyQuotaExceededError(
          quotaUsed,
          quotaLimit,
          secondsUntilMidnight
        );
      }

      return true;
    } catch (error) {
      if (error instanceof DailyQuotaExceededError) {
        throw error;
      }

      logger.error({ message: "Failed to check daily quota",  error, instructorId });
      return true; // Fail open
    }
  }

  async consumeQuota(
    instructorId: string,
    bytesUploaded: number
  ): Promise<void> {
    try {
      const quotaKey = `upload:quota:${instructorId}:${this.getCurrentDate()}`;

      // Increment quota usage
      await this.redisClient.incrBy(quotaKey, bytesUploaded);

      // Set expiry to midnight + 1 day
      const secondsUntilMidnight = this.getSecondsUntilMidnight();
      await this.redisClient.expire(quotaKey, secondsUntilMidnight + 86400);

      logger.debug({ message: "Consumed quota",  instructorId, bytesUploaded });
    } catch (error) {
      logger.error({ message: "Failed to consume quota", 
        error,
        instructorId,
        bytesUploaded,
      });
    }
  }

  async checkApiRateLimit(
    instructorId: string,
    tier: InstructorTier
  ): Promise<boolean> {
    try {
      const currentHour = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
      const rateLimitKey = `upload:api:${instructorId}:${currentHour}`;

      const requestCount = parseInt(
        (await this.redisClient.get(rateLimitKey)) || "0",
        10
      );
      const limit = this.API_RATE_LIMIT[tier];

      if (requestCount >= limit) {
        const secondsUntilNextHour =
          3600 - (Math.floor(Date.now() / 1000) % 3600);
        throw new RateLimitError(
          `API rate limit of ${limit} requests per hour exceeded`,
          secondsUntilNextHour,
          { requestCount, limit }
        );
      }

      // Increment request count
      await this.redisClient.incr(rateLimitKey);

      // Set expiry to 1 hour
      await this.redisClient.expire(rateLimitKey, 3600);

      return true;
    } catch (error) {
      if (error instanceof RateLimitError) {
        throw error;
      }

      logger.error({ message: "Failed to check API rate limit",  error, instructorId });
      return true; // Fail open
    }
  }

  async checkPresignedUrlLimit(instructorId: string): Promise<boolean> {
    try {
      const currentHour = new Date().toISOString().slice(0, 13);
      const urlLimitKey = `upload:presigned:${instructorId}:${currentHour}`;

      const urlCount = parseInt(
        (await this.redisClient.get(urlLimitKey)) || "0",
        10
      );

      if (urlCount >= this.PRESIGNED_URL_LIMIT) {
        const secondsUntilNextHour =
          3600 - (Math.floor(Date.now() / 1000) % 3600);
        throw new RateLimitError(
          `Pre-signed URL generation limit of ${this.PRESIGNED_URL_LIMIT} per hour exceeded`,
          secondsUntilNextHour,
          { urlCount, limit: this.PRESIGNED_URL_LIMIT }
        );
      }

      // Increment URL count
      await this.redisClient.incr(urlLimitKey);

      // Set expiry to 1 hour
      await this.redisClient.expire(urlLimitKey, 3600);

      return true;
    } catch (error) {
      if (error instanceof RateLimitError) {
        throw error;
      }

      logger.error({ message: "Failed to check pre-signed URL limit", 
        error,
        instructorId,
      });
      return true; // Fail open
    }
  }

  async getRateLimitStatus(
    instructorId: string,
    tier: InstructorTier
  ): Promise<RateLimitStatus> {
    try {
      // Get concurrent uploads
      const concurrentKey = `upload:concurrent:${instructorId}`;
      const concurrentUploads = await this.redisClient.sCard(concurrentKey);

      // Get daily quota usage
      const quotaKey = `upload:quota:${instructorId}:${this.getCurrentDate()}`;
      const dailyQuotaUsed = parseInt(
        (await this.redisClient.get(quotaKey)) || "0",
        10
      );

      // Get API request count
      const currentHour = new Date().toISOString().slice(0, 13);
      const rateLimitKey = `upload:api:${instructorId}:${currentHour}`;
      const apiRequestsThisHour = parseInt(
        (await this.redisClient.get(rateLimitKey)) || "0",
        10
      );

      return {
        concurrentUploads,
        maxConcurrentUploads: this.MAX_CONCURRENT_UPLOADS,
        dailyQuotaUsed,
        dailyQuotaLimit: this.DAILY_QUOTA_GB[tier] * 1024 * 1024 * 1024,
        apiRequestsThisHour,
        apiRequestLimit: this.API_RATE_LIMIT[tier],
      };
    } catch (error) {
      logger.error({ message: "Failed to get rate limit status",  error, instructorId });
      return {
        concurrentUploads: 0,
        maxConcurrentUploads: this.MAX_CONCURRENT_UPLOADS,
        dailyQuotaUsed: 0,
        dailyQuotaLimit: this.DAILY_QUOTA_GB[tier] * 1024 * 1024 * 1024,
        apiRequestsThisHour: 0,
        apiRequestLimit: this.API_RATE_LIMIT[tier],
      };
    }
  }

  private getCurrentDate(): string {
    return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  }

  private getSecondsUntilMidnight(): number {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return Math.floor((midnight.getTime() - now.getTime()) / 1000);
  }

  // Token bucket implementation for bandwidth throttling
  async refillTokenBucket(instructorId: string): Promise<void> {
    try {
      const bucketKey = `upload:tokens:${instructorId}`;
      const lastRefillKey = `upload:tokens:lastRefill:${instructorId}`;

      const lastRefillStr = await this.redisClient.get(lastRefillKey);
      const lastRefill = lastRefillStr
        ? parseInt(lastRefillStr, 10)
        : Date.now();
      const now = Date.now();
      const elapsedSeconds = (now - lastRefill) / 1000;

      // Refill rate: 10GB per hour
      const refillRate =
        this.TOKEN_BUCKET_REFILL_GB_PER_HOUR * 1024 * 1024 * 1024;
      const refillInterval = 3600; // 1 hour in seconds
      const tokensToAdd = Math.floor(
        (elapsedSeconds / refillInterval) * refillRate
      );

      if (tokensToAdd > 0) {
        await this.redisClient.incrBy(bucketKey, tokensToAdd);
        await this.redisClient.set(lastRefillKey, now.toString());

        logger.debug({ message: "Refilled token bucket",  instructorId, tokensToAdd });
      }
    } catch (error) {
      logger.error({ message: "Failed to refill token bucket",  error, instructorId });
    }
  }
}
