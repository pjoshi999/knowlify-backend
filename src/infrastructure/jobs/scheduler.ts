import cron from "node-cron";
import { Pool } from "pg";
import { S3Client } from "@aws-sdk/client-s3";
import { CostOptimizer } from "../../application/services/cost-optimizer.service";
import { AbandonedSessionCleanupJob } from "./abandoned-session-cleanup.job";
import { StorageTieringJob } from "./storage-tiering.job";
import { DeletionQueueProcessorJob } from "./deletion-queue-processor.job";
import { BackupVerificationJob } from "./backup-verification.job";
import { logger } from "../../shared/logger";

export class JobScheduler {
  private jobs: Map<string, ReturnType<typeof cron.schedule>> = new Map();

  constructor(
    private pool: Pool,
    private s3Client: S3Client,
    private costOptimizer: CostOptimizer,
    private bucketName: string
  ) {}

  start(): void {
    logger.info("Starting job scheduler");

    // Abandoned session cleanup - runs every hour
    const cleanupJob = new AbandonedSessionCleanupJob(
      this.pool,
      this.s3Client,
      this.bucketName
    );
    this.scheduleJob(
      "abandoned-session-cleanup",
      "0 * * * *", // Every hour at minute 0
      () => cleanupJob.execute()
    );

    // Storage tiering - runs daily at 2 AM
    const tieringJob = new StorageTieringJob(this.pool, this.costOptimizer);
    this.scheduleJob(
      "storage-tiering",
      "0 2 * * *", // Daily at 2:00 AM
      () => tieringJob.execute()
    );

    // Deletion queue processor - runs daily at 3 AM
    const deletionJob = new DeletionQueueProcessorJob(
      this.pool,
      this.costOptimizer
    );
    this.scheduleJob(
      "deletion-queue-processor",
      "0 3 * * *", // Daily at 3:00 AM
      () => deletionJob.execute()
    );

    // Backup verification - runs monthly on the 1st at 4 AM
    const backupJob = new BackupVerificationJob(this.pool);
    this.scheduleJob(
      "backup-verification",
      "0 4 1 * *", // Monthly on the 1st at 4:00 AM
      () => backupJob.execute()
    );

    logger.info({
      message: "Job scheduler started",
      jobs: Array.from(this.jobs.keys()),
    });
  }

  stop(): void {
    logger.info("Stopping job scheduler");

    for (const [name, task] of this.jobs.entries()) {
      task.stop();
      logger.debug(`Stopped job: ${name}`);
    }

    this.jobs.clear();
    logger.info("Job scheduler stopped");
  }

  private scheduleJob(
    name: string,
    cronExpression: string,
    handler: () => Promise<void>
  ): void {
    const task = cron.schedule(cronExpression, async () => {
      logger.info(`Running scheduled job: ${name}`);
      try {
        await handler();
      } catch (error) {
        logger.error({
          message: `Scheduled job failed: ${name}`,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    this.jobs.set(name, task);
    logger.info({ message: `Scheduled job: ${name}`, cronExpression });
  }

  // Manual trigger for testing/debugging
  async runJob(name: string): Promise<void> {
    logger.info(`Manually triggering job: ${name}`);

    switch (name) {
      case "abandoned-session-cleanup": {
        const job = new AbandonedSessionCleanupJob(
          this.pool,
          this.s3Client,
          this.bucketName
        );
        await job.execute();
        break;
      }
      case "storage-tiering": {
        const job = new StorageTieringJob(this.pool, this.costOptimizer);
        await job.execute();
        break;
      }
      case "deletion-queue-processor": {
        const job = new DeletionQueueProcessorJob(
          this.pool,
          this.costOptimizer
        );
        await job.execute();
        break;
      }
      case "backup-verification": {
        const job = new BackupVerificationJob(this.pool);
        await job.execute();
        break;
      }
      default:
        throw new Error(`Unknown job: ${name}`);
    }
  }
}
