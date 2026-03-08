/**
 * Background Job Service
 *
 * Manages background job enqueueing and status tracking
 */

import { Queue } from "bullmq";
import { AnalysisJobData } from "../jobs/analysis-job.processor.js";
import { config } from "../../shared/config.js";
import { createModuleLogger } from "../../shared/logger.js";

const log = createModuleLogger("background-job-service");

const QUEUE_NAME = "ai-analysis";

export interface JobStatus {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress?: number;
  result?: unknown;
  error?: string;
}

export class BackgroundJobService {
  private queue: Queue;

  constructor() {
    this.queue = new Queue(QUEUE_NAME, {
      connection: {
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
      },
    });

    log.info("Background job service initialized");
  }

  /**
   * Enqueue an analysis job
   */
  async enqueueAnalysis(data: AnalysisJobData): Promise<string> {
    log.info(
      { lessonId: data.lessonId, assetType: data.assetType },
      "Enqueueing analysis job"
    );

    const job = await this.queue.add("analyze-content", data, {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000, // Start with 1 second, then 2s, 4s
      },
      removeOnComplete: 100, // Keep last 100 completed jobs
      removeOnFail: false, // Keep failed jobs for debugging
    });

    log.info(
      { jobId: job.id, lessonId: data.lessonId },
      "Analysis job enqueued"
    );

    return job.id!;
  }

  /**
   * Enqueue multiple analysis jobs
   */
  async enqueueMultipleAnalyses(
    dataArray: AnalysisJobData[]
  ): Promise<string[]> {
    log.info({ count: dataArray.length }, "Enqueueing multiple analysis jobs");

    const jobs = await this.queue.addBulk(
      dataArray.map((data) => ({
        name: "analyze-content",
        data,
        opts: {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 1000,
          },
          removeOnComplete: 100,
          removeOnFail: false,
        },
      }))
    );

    const jobIds = jobs.map((job) => job.id!);

    log.info({ count: jobIds.length }, "Multiple analysis jobs enqueued");

    return jobIds;
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<JobStatus | null> {
    const job = await this.queue.getJob(jobId);

    if (!job) {
      return null;
    }

    const state = await job.getState();
    const progress =
      typeof job.progress === "number" ? job.progress : undefined;

    let status: JobStatus["status"];
    switch (state) {
      case "waiting":
      case "delayed":
        status = "queued";
        break;
      case "active":
        status = "processing";
        break;
      case "completed":
        status = "completed";
        break;
      case "failed":
        status = "failed";
        break;
      default:
        status = "queued";
    }

    return {
      id: job.id!,
      status,
      progress,
      result: job.returnvalue,
      error: job.failedReason,
    };
  }

  /**
   * Get status for multiple jobs
   */
  async getMultipleJobStatuses(
    jobIds: string[]
  ): Promise<Map<string, JobStatus>> {
    const statusMap = new Map<string, JobStatus>();

    await Promise.all(
      jobIds.map(async (jobId) => {
        const status = await this.getJobStatus(jobId);
        if (status) {
          statusMap.set(jobId, status);
        }
      })
    );

    return statusMap;
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId: string): Promise<void> {
    const job = await this.queue.getJob(jobId);
    if (job) {
      await job.remove();
      log.info({ jobId }, "Job cancelled");
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  }> {
    const [waiting, active, completed, failed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
    ]);

    return { waiting, active, completed, failed };
  }

  /**
   * Close the queue
   */
  async close(): Promise<void> {
    await this.queue.close();
    log.info("Background job service closed");
  }
}

export const createBackgroundJobService = (): BackgroundJobService => {
  return new BackgroundJobService();
};
