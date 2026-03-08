import { Priority } from "@domain/models/transcoding-job.model.js";
import { InstructorTier } from "./rate-limiter.service.js";
import { logger } from "@shared/logger.js";
import { RedisClient } from "@infrastructure/cache/redis-types.js";

export interface UploadRequest {
  sessionId: string;
  instructorId: string;
  instructorTier: InstructorTier;
  fileSize: number;
  coursePublished: boolean;
}

export interface ScheduleResult {
  scheduled: boolean;
  queued: boolean;
  queuePosition?: number;
  estimatedStartTime?: Date;
}

export interface QueuePosition {
  position: number;
  estimatedWaitTime: number;
}

export interface CapacityInfo {
  currentLoad: number;
  activeUploads: number;
  queuedUploads: number;
  maxCapacity: number;
}

export class UploadScheduler {
  private readonly CAPACITY_THRESHOLD = 0.8; // 80%
  private readonly MAX_CAPACITY = 1000; // Maximum concurrent uploads system-wide
  private readonly STARVATION_PREVENTION_HOURS = 24;
  private readonly QUEUE_KEY = "upload:queue";
  private readonly ACTIVE_UPLOADS_KEY = "upload:active";

  constructor(private redisClient: RedisClient) {}

  async scheduleUpload(request: UploadRequest): Promise<ScheduleResult> {
    try {
      const capacity = await this.getSystemCapacity();

      // Check if system is over capacity
      if (capacity.currentLoad >= this.CAPACITY_THRESHOLD) {
        // Queue the upload
        const queuePosition = await this.enqueueUpload(request);
        const estimatedStartTime = await this.estimateStartTime(queuePosition);

        logger.info({
          message: "Upload queued due to capacity",
          sessionId: request.sessionId,
          queuePosition,
          currentLoad: capacity.currentLoad,
        });

        return {
          scheduled: false,
          queued: true,
          queuePosition,
          estimatedStartTime,
        };
      }

      // System has capacity, schedule immediately
      await this.markAsActive(request.sessionId);

      logger.info({
        message: "Upload scheduled immediately",
        sessionId: request.sessionId,
        currentLoad: capacity.currentLoad,
      });

      return {
        scheduled: true,
        queued: false,
      };
    } catch (error) {
      logger.error({ message: "Failed to schedule upload", error, request });
      throw error;
    }
  }

  async getQueuePosition(sessionId: string): Promise<QueuePosition> {
    try {
      const rank = await this.redisClient.zRank(this.QUEUE_KEY, sessionId);

      if (rank === null || rank === undefined) {
        return { position: 0, estimatedWaitTime: 0 };
      }

      const position = rank + 1; // Convert 0-based to 1-based
      const estimatedWaitTime = await this.calculateWaitTime(position);

      return { position, estimatedWaitTime };
    } catch (error) {
      logger.error({
        message: "Failed to get queue position",
        error,
        sessionId,
      });
      return { position: 0, estimatedWaitTime: 0 };
    }
  }

  async processNextUpload(): Promise<string | null> {
    try {
      // Apply starvation prevention: boost priority of old uploads
      await this.applyStarvationPrevention();

      // Get the highest priority upload from queue
      const result = await this.redisClient.zPopMin(this.QUEUE_KEY);

      if (!result || !result.value) {
        return null;
      }

      const sessionId = result.value;

      // Mark as active
      await this.markAsActive(sessionId);

      logger.info({ message: "Processed next upload from queue", sessionId });

      return sessionId;
    } catch (error) {
      logger.error({ message: "Failed to process next upload", error });
      return null;
    }
  }

  async getSystemCapacity(): Promise<CapacityInfo> {
    try {
      const activeUploads = await this.redisClient.sCard(
        this.ACTIVE_UPLOADS_KEY
      );
      const queuedUploads = await this.redisClient.zCard(this.QUEUE_KEY);

      const currentLoad = activeUploads / this.MAX_CAPACITY;

      return {
        currentLoad,
        activeUploads,
        queuedUploads,
        maxCapacity: this.MAX_CAPACITY,
      };
    } catch (error) {
      logger.error({ message: "Failed to get system capacity", error });
      return {
        currentLoad: 0,
        activeUploads: 0,
        queuedUploads: 0,
        maxCapacity: this.MAX_CAPACITY,
      };
    }
  }

  async updatePriority(sessionId: string, priority: Priority): Promise<void> {
    try {
      // Get current score
      const currentScore = await this.redisClient.zScore(
        this.QUEUE_KEY,
        sessionId
      );

      if (currentScore === null || currentScore === undefined) {
        logger.warn({ message: "Session not found in queue", sessionId });
        return;
      }

      // Calculate new score based on priority
      const priorityBoost = this.getPriorityBoost(priority);
      const newScore = Date.now() - priorityBoost;

      await this.redisClient.zAdd(this.QUEUE_KEY, {
        score: newScore,
        value: sessionId,
      });

      logger.info({ message: "Updated upload priority", sessionId, priority });
    } catch (error) {
      logger.error({
        message: "Failed to update priority",
        error,
        sessionId,
        priority,
      });
    }
  }

  async removeFromQueue(sessionId: string): Promise<void> {
    try {
      await this.redisClient.zRem(this.QUEUE_KEY, sessionId);
      await this.redisClient.sRem(this.ACTIVE_UPLOADS_KEY, sessionId);

      logger.info({ message: "Removed upload from queue", sessionId });
    } catch (error) {
      logger.error({
        message: "Failed to remove from queue",
        error,
        sessionId,
      });
    }
  }

  private async enqueueUpload(request: UploadRequest): Promise<number> {
    const score = this.calculatePriorityScore(request);

    await this.redisClient.zAdd(this.QUEUE_KEY, {
      score,
      value: request.sessionId,
    });

    // Store metadata for starvation prevention
    const metadataKey = `upload:queue:meta:${request.sessionId}`;
    await this.redisClient.hSet(metadataKey, {
      enqueuedAt: Date.now().toString(),
      instructorTier: request.instructorTier,
      fileSize: request.fileSize.toString(),
    });
    await this.redisClient.expire(metadataKey, 7 * 24 * 60 * 60); // 7 days

    const rank = await this.redisClient.zRank(
      this.QUEUE_KEY,
      request.sessionId
    );
    return (rank ?? 0) + 1;
  }

  private calculatePriorityScore(request: UploadRequest): number {
    let score = Date.now(); // Base timestamp for FIFO within same priority

    // Priority adjustments (lower score = higher priority)
    if (request.instructorTier === "premium") {
      score -= 1000000000; // High priority

      if (request.coursePublished) {
        score -= 500000000; // Extra boost for published courses
      }
    } else if (request.instructorTier === "standard") {
      score -= 500000000; // Normal priority
    }
    // Free tier gets no adjustment (low priority)

    return score;
  }

  private getPriorityBoost(priority: Priority): number {
    switch (priority) {
      case "high":
        return 1500000000;
      case "normal":
        return 500000000;
      case "low":
        return 0;
    }
  }

  private async markAsActive(sessionId: string): Promise<void> {
    await this.redisClient.sAdd(this.ACTIVE_UPLOADS_KEY, sessionId);
    await this.redisClient.expire(this.ACTIVE_UPLOADS_KEY, 7 * 24 * 60 * 60); // 7 days
  }

  private async estimateStartTime(queuePosition: number): Promise<Date> {
    // Estimate based on average upload time (assume 30 minutes per upload)
    const averageUploadTimeMinutes = 30;
    const estimatedMinutes = queuePosition * averageUploadTimeMinutes;

    const startTime = new Date();
    startTime.setMinutes(startTime.getMinutes() + estimatedMinutes);

    return startTime;
  }

  private async calculateWaitTime(position: number): Promise<number> {
    // Estimate wait time in seconds (assume 30 minutes per upload)
    const averageUploadTimeSeconds = 30 * 60;
    return position * averageUploadTimeSeconds;
  }

  private async applyStarvationPrevention(): Promise<void> {
    try {
      // Get all queued uploads
      const queuedUploads = await this.redisClient.zRange(
        this.QUEUE_KEY,
        0,
        -1
      );

      const now = Date.now();
      const starvationThresholdMs =
        this.STARVATION_PREVENTION_HOURS * 60 * 60 * 1000;

      for (const sessionId of queuedUploads) {
        const metadataKey = `upload:queue:meta:${sessionId}`;
        const metadata = await this.redisClient.hGetAll(metadataKey);

        if (!metadata["enqueuedAt"]) continue;

        const enqueuedAt = parseInt(metadata["enqueuedAt"], 10);
        const waitTime = now - enqueuedAt;

        // If upload has been waiting for more than threshold, boost priority
        if (waitTime > starvationThresholdMs) {
          const currentScore = await this.redisClient.zScore(
            this.QUEUE_KEY,
            sessionId
          );

          if (currentScore !== null && currentScore !== undefined) {
            // Boost to high priority
            const boostedScore = now - 2000000000; // Higher than premium priority
            await this.redisClient.zAdd(this.QUEUE_KEY, {
              score: boostedScore,
              value: sessionId,
            });

            logger.info({
              message: "Applied starvation prevention boost",
              sessionId,
              waitTimeHours: waitTime / (60 * 60 * 1000),
            });
          }
        }
      }
    } catch (error) {
      logger.error({ message: "Failed to apply starvation prevention", error });
    }
  }

  // Cleanup method to remove stale active uploads
  async cleanupStaleActiveUploads(_maxAgeHours: number = 24): Promise<number> {
    try {
      // This would require storing timestamps with active uploads
      // For now, we rely on Redis expiry
      logger.info("Cleanup stale active uploads called");
      return 0;
    } catch (error) {
      logger.error({
        message: "Failed to cleanup stale active uploads",
        error,
      });
      return 0;
    }
  }
}
