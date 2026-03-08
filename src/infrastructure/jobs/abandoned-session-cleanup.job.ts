import { Pool } from "pg";
import { S3Client, AbortMultipartUploadCommand } from "@aws-sdk/client-s3";
import { logger } from "../../shared/logger";

export class AbandonedSessionCleanupJob {
  constructor(
    private pool: Pool,
    private s3Client: S3Client,
    private bucketName: string
  ) {}

  async execute(): Promise<void> {
    logger.info("Starting abandoned session cleanup job");

    try {
      // Find expired sessions
      const result = await this.pool.query(
        `SELECT session_id, storage_key, upload_id, instructor_id, course_id
         FROM upload_sessions
         WHERE expires_at < NOW() 
           AND status IN ('pending', 'uploading')
         ORDER BY expires_at ASC
         LIMIT 100`
      );

      const expiredSessions = result.rows;
      logger.info(
        `Found ${expiredSessions.length} expired sessions to clean up`
      );

      for (const session of expiredSessions) {
        await this.cleanupSession(session);
      }

      logger.info({
        message: "Abandoned session cleanup job completed",
        cleanedCount: expiredSessions.length,
      });
    } catch (error) {
      logger.error({ message: "Abandoned session cleanup job failed", error });
      throw error;
    }
  }

  private async cleanupSession(session: any): Promise<void> {
    const { session_id, storage_key, upload_id, instructor_id, course_id } =
      session;

    try {
      // Abort S3 multipart upload
      if (upload_id) {
        await this.abortMultipartUpload(storage_key, upload_id);
      }

      // Delete chunks from database
      await this.pool.query(`DELETE FROM upload_chunks WHERE session_id = $1`, [
        session_id,
      ]);

      // Update session status to cancelled
      await this.pool.query(
        `UPDATE upload_sessions 
         SET status = 'cancelled', updated_at = NOW()
         WHERE session_id = $1`,
        [session_id]
      );

      logger.info({
        message: "Cleaned up abandoned session",
        sessionId: session_id,
        instructorId: instructor_id,
        courseId: course_id,
      });
    } catch (error) {
      logger.error({
        message: "Failed to cleanup session",
        error,
        sessionId: session_id,
      });
    }
  }

  private async abortMultipartUpload(
    storageKey: string,
    uploadId: string
  ): Promise<void> {
    try {
      const command = new AbortMultipartUploadCommand({
        Bucket: this.bucketName,
        Key: storageKey,
        UploadId: uploadId,
      });

      await this.s3Client.send(command);
      logger.debug({
        message: "Aborted multipart upload",
        storageKey,
        uploadId,
      });
    } catch (error) {
      logger.error({
        message: "Failed to abort multipart upload",
        error,
        storageKey,
        uploadId,
      });
      // Don't throw - we still want to clean up database records
    }
  }
}
