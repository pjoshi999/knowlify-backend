import { PoolClient } from "pg";
import crypto from "crypto";
import { query, transaction } from "@infrastructure/database/pool.js";
import {
  ChunkCompletionParams,
  MultipartUploadInfo,
  ProgressInfo,
} from "@domain/models/upload-chunk.model.js";
import { UploadSession } from "@domain/models/upload-session.model.js";
import { StorageAdapter } from "@infrastructure/adapters/storage.adapter.js";
import {
  ChecksumMismatchError,
  ChunkAlreadyUploadedError,
  DatabaseError,
} from "@shared/errors/upload-errors.js";
import { logger } from "@shared/logger.js";

export class ChunkManager {
  constructor(private storageAdapter: StorageAdapter) {}

  async initializeUpload(session: UploadSession): Promise<MultipartUploadInfo> {
    return {
      uploadId: session.uploadId,
      chunkSize: session.chunkSize,
      totalChunks: session.totalChunks,
    };
  }

  async recordChunkCompletion(params: ChunkCompletionParams): Promise<void> {
    try {
      await transaction(async (client: PoolClient) => {
        // Check if chunk already exists
        const existingChunk = await client.query(
          "SELECT id FROM upload_chunks WHERE session_id = $1 AND chunk_number = $2",
          [params.sessionId, params.chunkNumber]
        );

        if (existingChunk.rows.length > 0) {
          throw new ChunkAlreadyUploadedError(
            params.sessionId,
            params.chunkNumber
          );
        }

        // Insert chunk record
        await client.query(
          `INSERT INTO upload_chunks (session_id, chunk_number, etag, checksum, uploaded_at)
           VALUES ($1, $2, $3, $4, NOW())`,
          [params.sessionId, params.chunkNumber, params.etag, params.checksum]
        );

        // Update session updated_at
        await client.query(
          "UPDATE upload_sessions SET updated_at = NOW() WHERE session_id = $1",
          [params.sessionId]
        );
      });

      logger.info({
        message: "Recorded chunk completion",
        sessionId: params.sessionId,
        chunkNumber: params.chunkNumber,
      });
    } catch (error) {
      if (error instanceof ChunkAlreadyUploadedError) {
        throw error;
      }

      logger.error({
        message: "Failed to record chunk completion",
        error,
        params,
      });
      throw new DatabaseError("Failed to record chunk completion", {
        originalError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  verifyChunkIntegrity(
    expectedChecksum: string,
    receivedChecksum: string
  ): boolean {
    if (expectedChecksum !== receivedChecksum) {
      throw new ChecksumMismatchError(expectedChecksum, receivedChecksum);
    }
    return true;
  }

  async getCompletedChunks(sessionId: string): Promise<number[]> {
    try {
      const result = await query<{ chunkNumber: number }>(
        `SELECT chunk_number as "chunkNumber" 
         FROM upload_chunks 
         WHERE session_id = $1 
         ORDER BY chunk_number ASC`,
        [sessionId]
      );

      return result.rows.map((row) => row.chunkNumber);
    } catch (error) {
      logger.error({
        message: "Failed to get completed chunks",
        error,
        sessionId,
      });
      throw new DatabaseError("Failed to get completed chunks", {
        originalError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async finalizeUpload(session: UploadSession): Promise<void> {
    try {
      // Get all chunks with their ETags
      const chunksResult = await query<{ chunkNumber: number; etag: string }>(
        `SELECT chunk_number as "chunkNumber", etag 
         FROM upload_chunks 
         WHERE session_id = $1 
         ORDER BY chunk_number ASC`,
        [session.sessionId]
      );

      const parts = chunksResult.rows.map((row) => ({
        partNumber: row.chunkNumber,
        etag: row.etag,
      }));

      // Verify all chunks are present
      if (parts.length !== session.totalChunks) {
        throw new DatabaseError(
          `Missing chunks: expected ${session.totalChunks}, got ${parts.length}`
        );
      }

      logger.info({
        message: "Preparing to finalize upload",
        sessionId: session.sessionId,
        totalChunks: session.totalChunks,
        retrievedParts: parts.length,
        sampleEtag: parts[0]?.etag,
      });

      // Complete multipart upload in S3
      await this.storageAdapter.completeMultipartUpload({
        uploadId: session.uploadId,
        key: session.storageKey,
        parts,
      });

      logger.info({
        message: "Finalized upload",
        sessionId: session.sessionId,
        storageKey: session.storageKey,
        totalChunks: parts.length,
      });
    } catch (error) {
      logger.error({
        message: "Failed to finalize upload",
        error,
        sessionId: session.sessionId,
        errorDetails: error instanceof Error ? error.message : String(error),
      });
      throw new DatabaseError("Failed to finalize upload", {
        originalError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async calculateProgress(
    sessionId: string,
    session: UploadSession
  ): Promise<ProgressInfo> {
    try {
      // Get completed chunks with timestamps
      const chunksResult = await query<{
        chunkNumber: number;
        uploadedAt: Date;
      }>(
        `SELECT chunk_number as "chunkNumber", uploaded_at as "uploadedAt"
         FROM upload_chunks 
         WHERE session_id = $1 
         ORDER BY uploaded_at DESC 
         LIMIT 10`,
        [sessionId]
      );

      const completedChunks = chunksResult.rowCount || 0;
      const totalChunks = session.totalChunks;
      const percentComplete = (completedChunks / totalChunks) * 100;

      // Calculate bytes uploaded (handle last chunk which may be smaller)
      const bytesUploaded =
        completedChunks === totalChunks
          ? session.fileSize
          : Math.min(completedChunks * session.chunkSize, session.fileSize);

      const bytesRemaining = session.fileSize - bytesUploaded;

      // Calculate upload speed as rolling average of last 10 chunks
      let uploadSpeedBytesPerSec = 0;

      if (chunksResult.rows.length >= 2) {
        const recentChunks = chunksResult.rows;
        const oldestChunk = recentChunks[recentChunks.length - 1];
        const newestChunk = recentChunks[0];

        if (oldestChunk && newestChunk) {
          const timeDiffMs =
            new Date(newestChunk.uploadedAt).getTime() -
            new Date(oldestChunk.uploadedAt).getTime();

          if (timeDiffMs > 0) {
            const bytesInWindow = recentChunks.length * session.chunkSize;
            uploadSpeedBytesPerSec = (bytesInWindow / timeDiffMs) * 1000;
          }
        }
      }

      // Calculate ETA
      const estimatedTimeRemainingSec =
        uploadSpeedBytesPerSec > 0
          ? Math.ceil(bytesRemaining / uploadSpeedBytesPerSec)
          : 0;

      return {
        percentComplete: Math.min(percentComplete, 100),
        bytesUploaded,
        bytesRemaining,
        uploadSpeedBytesPerSec,
        estimatedTimeRemainingSec,
        chunksCompleted: completedChunks,
        totalChunks,
      };
    } catch (error) {
      logger.error({
        message: "Failed to calculate progress",
        error,
        sessionId,
      });
      throw new DatabaseError("Failed to calculate progress", {
        originalError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async isUploadComplete(
    sessionId: string,
    totalChunks: number
  ): Promise<boolean> {
    try {
      const result = await query<{ count: string }>(
        "SELECT COUNT(*) as count FROM upload_chunks WHERE session_id = $1",
        [sessionId]
      );

      const completedChunks = parseInt(result.rows[0]?.count || "0", 10);
      return completedChunks === totalChunks;
    } catch (error) {
      logger.error({
        message: "Failed to check upload completion",
        error,
        sessionId,
      });
      throw new DatabaseError("Failed to check upload completion", {
        originalError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Utility method to calculate SHA-256 checksum
  static calculateChecksum(data: Buffer): string {
    return crypto.createHash("sha256").update(data).digest("hex");
  }
}
