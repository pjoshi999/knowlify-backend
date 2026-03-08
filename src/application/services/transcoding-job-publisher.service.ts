import {
  SQSClient,
  SendMessageCommand,
  SendMessageBatchCommand,
} from "@aws-sdk/client-sqs";
import crypto from "crypto";
import { query } from "@infrastructure/database/pool.js";
import {
  TranscodingJob,
  TranscodingResult,
  TranscodingFailure,
  Priority,
  QUALITY_PROFILES,
  QualityProfile,
} from "@domain/models/transcoding-job.model.js";
import { UploadSession } from "@domain/models/upload-session.model.js";
import { InstructorTier } from "./rate-limiter.service.js";
import { MessageQueueError } from "@shared/errors/upload-errors.js";
import { logger } from "@shared/logger.js";

export class TranscodingJobPublisher {
  private sqsClient: SQSClient;
  private queueUrls: Record<Priority, string>;
  // Dead letter queue URL for failed jobs (currently unused but reserved for future implementation)
  // private _deadLetterQueueUrl: string;

  constructor(config: {
    region: string;
    queueUrls: {
      high: string;
      normal: string;
      low: string;
      deadLetter: string;
    };
  }) {
    this.sqsClient = new SQSClient({ region: config.region });
    this.queueUrls = {
      high: config.queueUrls.high,
      normal: config.queueUrls.normal,
      low: config.queueUrls.low,
    };
    // this._deadLetterQueueUrl = config.queueUrls.deadLetter;

    logger.info({
      message: "TranscodingJobPublisher initialized",
      region: config.region,
      queues: Object.keys(this.queueUrls),
    });
  }

  async publishJob(
    session: UploadSession,
    instructorTier: InstructorTier
  ): Promise<string> {
    try {
      const jobId = crypto.randomUUID();

      // Determine priority based on instructor tier
      const priority = this.determinePriority(instructorTier, false);

      // Determine which quality profiles to generate based on file size
      const profiles = this.selectQualityProfiles(session.fileSize);

      // Create transcoding job record in database
      await query(
        `INSERT INTO transcoding_jobs (
          job_id, session_id, instructor_id, course_id, source_key,
          priority, status, profiles, retry_count, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
        [
          jobId,
          session.sessionId,
          session.instructorId,
          session.courseId,
          session.storageKey,
          priority,
          "queued",
          JSON.stringify(profiles),
          0,
        ]
      );

      // Publish to SQS
      const queueUrl = this.queueUrls[priority];

      const message = {
        jobId,
        sessionId: session.sessionId,
        instructorId: session.instructorId,
        courseId: session.courseId,
        sourceKey: session.storageKey,
        priority,
        profiles,
        callbackUrl: `${process.env["BACKEND_URL"] || "http://localhost:8080"}/api/transcoding/callback`,
        metadata: {
          fileName: session.fileName,
          fileSize: session.fileSize,
          mimeType: session.mimeType,
        },
      };

      const command = new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(message),
        MessageAttributes: {
          Priority: {
            DataType: "String",
            StringValue: priority,
          },
          RetryCount: {
            DataType: "Number",
            StringValue: "0",
          },
          InstructorTier: {
            DataType: "String",
            StringValue: instructorTier,
          },
        },
        MessageDeduplicationId: jobId,
        MessageGroupId: session.instructorId,
      });

      await this.sqsClient.send(command);

      logger.info({
        message: "Published transcoding job",
        jobId,
        sessionId: session.sessionId,
        priority,
        profiles: profiles.map((p) => p.name),
      });

      return jobId;
    } catch (error) {
      logger.error({
        message: "Failed to publish transcoding job",
        error,
        session,
      });
      throw new MessageQueueError("Failed to publish transcoding job", {
        originalError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async publishBatch(
    sessions: UploadSession[],
    instructorTier: InstructorTier
  ): Promise<string[]> {
    try {
      const jobIds: string[] = [];
      const entries = [];

      for (const session of sessions) {
        const jobId = crypto.randomUUID();
        jobIds.push(jobId);

        const priority = this.determinePriority(instructorTier, false);
        const profiles = this.selectQualityProfiles(session.fileSize);

        // Create transcoding job record in database
        await query(
          `INSERT INTO transcoding_jobs (
            job_id, session_id, instructor_id, course_id, source_key,
            priority, status, profiles, retry_count, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
          [
            jobId,
            session.sessionId,
            session.instructorId,
            session.courseId,
            session.storageKey,
            priority,
            "queued",
            JSON.stringify(profiles),
            0,
          ]
        );

        const message = {
          jobId,
          sessionId: session.sessionId,
          instructorId: session.instructorId,
          courseId: session.courseId,
          sourceKey: session.storageKey,
          priority,
          profiles,
          callbackUrl: `${process.env["BACKEND_URL"] || "http://localhost:8080"}/api/transcoding/callback`,
          metadata: {
            fileName: session.fileName,
            fileSize: session.fileSize,
            mimeType: session.mimeType,
          },
        };

        entries.push({
          Id: jobId,
          MessageBody: JSON.stringify(message),
          MessageAttributes: {
            Priority: {
              DataType: "String",
              StringValue: priority,
            },
            RetryCount: {
              DataType: "Number",
              StringValue: "0",
            },
            InstructorTier: {
              DataType: "String",
              StringValue: instructorTier,
            },
          },
          MessageDeduplicationId: jobId,
          MessageGroupId: session.instructorId,
        });
      }

      // Send batch (max 10 messages per batch)
      const batchSize = 10;
      for (let i = 0; i < entries.length; i += batchSize) {
        const batch = entries.slice(i, i + batchSize);
        const priority = this.determinePriority(instructorTier, false);
        const queueUrl = this.queueUrls[priority];

        const command = new SendMessageBatchCommand({
          QueueUrl: queueUrl,
          Entries: batch,
        });

        await this.sqsClient.send(command);
      }

      logger.info({
        message: "Published batch transcoding jobs",
        count: jobIds.length,
        instructorTier,
      });

      return jobIds;
    } catch (error) {
      logger.error({
        message: "Failed to publish batch transcoding jobs",
        error,
      });
      throw new MessageQueueError("Failed to publish batch transcoding jobs", {
        originalError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async handleCompletion(result: TranscodingResult): Promise<void> {
    try {
      // Update transcoding job status
      await query(
        `UPDATE transcoding_jobs 
         SET status = $1, outputs = $2, completed_at = NOW()
         WHERE job_id = $3`,
        ["completed", JSON.stringify(result.outputs), result.jobId]
      );

      // Update upload session status
      await query(
        `UPDATE upload_sessions 
         SET status = $1, updated_at = NOW()
         WHERE session_id = $2`,
        ["completed", result.sessionId]
      );

      logger.info({
        message: "Handled transcoding completion",
        jobId: result.jobId,
        sessionId: result.sessionId,
        outputs: result.outputs.length,
      });

      // TODO: Send notification to instructor
    } catch (error) {
      logger.error({
        message: "Failed to handle transcoding completion",
        error,
        result,
      });
      throw new MessageQueueError("Failed to handle transcoding completion", {
        originalError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async handleFailure(failure: TranscodingFailure): Promise<void> {
    try {
      const maxRetries = 3;

      if (failure.retryCount < maxRetries) {
        // Retry with exponential backoff
        const delaySeconds = Math.pow(2, failure.retryCount) * 60; // 1min, 2min, 4min

        await query(
          `UPDATE transcoding_jobs 
           SET retry_count = retry_count + 1, error = $1
           WHERE job_id = $2`,
          [failure.error, failure.jobId]
        );

        logger.info({
          message: "Scheduling transcoding retry",
          jobId: failure.jobId,
          retryCount: failure.retryCount + 1,
          delaySeconds,
        });

        // TODO: Schedule retry with delay
      } else {
        // Max retries exceeded, mark as failed
        await query(
          `UPDATE transcoding_jobs 
           SET status = $1, error = $2, completed_at = NOW()
           WHERE job_id = $3`,
          ["failed", failure.error, failure.jobId]
        );

        await query(
          `UPDATE upload_sessions 
           SET status = $1, updated_at = NOW()
           WHERE session_id = $2`,
          ["failed", failure.sessionId]
        );

        logger.error({
          message: "Transcoding failed permanently",
          jobId: failure.jobId,
          sessionId: failure.sessionId,
          error: failure.error,
        });

        // TODO: Send failure notification to instructor
      }
    } catch (error) {
      logger.error({
        message: "Failed to handle transcoding failure",
        error,
        failure,
      });
      throw new MessageQueueError("Failed to handle transcoding failure", {
        originalError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private determinePriority(
    instructorTier: InstructorTier,
    coursePublished: boolean
  ): Priority {
    if (instructorTier === "premium") {
      return coursePublished ? "high" : "normal";
    } else if (instructorTier === "standard") {
      return "normal";
    }
    return "low";
  }

  private selectQualityProfiles(fileSize: number): QualityProfile[] {
    const profiles: QualityProfile[] = [];

    // Always include 360p and 720p
    profiles.push(QUALITY_PROFILES["360p"]!);
    profiles.push(QUALITY_PROFILES["720p"]!);

    // Include 1080p for files > 500MB
    if (fileSize > 500 * 1024 * 1024) {
      profiles.push(QUALITY_PROFILES["1080p"]!);
    }

    // Include 4K for files > 2GB
    if (fileSize > 2 * 1024 * 1024 * 1024) {
      profiles.push(QUALITY_PROFILES["4K"]!);
    }

    return profiles;
  }

  async getJobStatus(jobId: string): Promise<TranscodingJob | null> {
    try {
      const result = await query<TranscodingJob>(
        `SELECT 
          job_id as "jobId",
          session_id as "sessionId",
          instructor_id as "instructorId",
          course_id as "courseId",
          source_key as "sourceKey",
          priority,
          status,
          profiles,
          outputs,
          retry_count as "retryCount",
          error,
          created_at as "createdAt",
          started_at as "startedAt",
          completed_at as "completedAt"
        FROM transcoding_jobs
        WHERE job_id = $1`,
        [jobId]
      );

      return result.rows[0] || null;
    } catch (error) {
      logger.error({ message: "Failed to get job status", error, jobId });
      return null;
    }
  }
}
