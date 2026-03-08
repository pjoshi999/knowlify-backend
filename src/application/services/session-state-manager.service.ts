import { PoolClient } from "pg";
import crypto from "crypto";
import { query, transaction } from "@infrastructure/database/pool.js";
import {
  UploadSession,
  CreateUploadSessionParams,
  SessionStatus,
  UploadSessionFilters,
  canTransitionTo,
} from "@domain/models/upload-session.model.js";
import {
  generateStorageKey,
  calculateChunkInfo,
} from "@infrastructure/adapters/storage.adapter.js";
import {
  SessionNotFoundError,
  SessionExpiredError,
  InvalidStatusTransitionError,
  DatabaseError,
} from "@shared/errors/upload-errors";
import { logger } from "@shared/logger.js";
import { RedisClient } from "@infrastructure/cache/redis-types.js";

export class SessionStateManager {
  private redisClient: RedisClient | null = null;
  private readonly SESSION_CACHE_TTL = 3600; // 1 hour
  private readonly SESSION_EXPIRY_DAYS = 7;

  constructor(redisClient?: RedisClient) {
    this.redisClient = redisClient || null;
  }

  async createSession(
    params: CreateUploadSessionParams
  ): Promise<UploadSession> {
    try {
      const sessionId = crypto.randomUUID();
      const storageKey = generateStorageKey(
        params.instructorId,
        params.courseId,
        params.fileName
      );
      const { chunkSize, totalChunks } = calculateChunkInfo(params.fileSize);

      const now = new Date();
      const expiresAt = new Date(now);
      expiresAt.setDate(expiresAt.getDate() + this.SESSION_EXPIRY_DAYS);

      // Generate a temporary upload ID (will be replaced with actual S3 upload ID)
      const uploadId = `temp-${sessionId}`;

      const result = await query<UploadSession>(
        `INSERT INTO upload_sessions (
          session_id, instructor_id, course_id, file_name, file_size, mime_type,
          checksum, status, storage_key, upload_id, chunk_size, total_chunks,
          created_at, updated_at, expires_at, version
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING 
          session_id as "sessionId",
          instructor_id as "instructorId",
          course_id as "courseId",
          file_name as "fileName",
          file_size as "fileSize",
          mime_type as "mimeType",
          checksum,
          status,
          storage_key as "storageKey",
          upload_id as "uploadId",
          chunk_size as "chunkSize",
          total_chunks as "totalChunks",
          created_at as "createdAt",
          updated_at as "updatedAt",
          expires_at as "expiresAt",
          version`,
        [
          sessionId,
          params.instructorId,
          params.courseId,
          params.fileName,
          params.fileSize,
          params.mimeType,
          params.checksum || null,
          "pending",
          storageKey,
          uploadId,
          chunkSize,
          totalChunks,
          now,
          now,
          expiresAt,
          1,
        ]
      );

      const session = result.rows[0];

      if (!session) {
        throw new DatabaseError("Failed to create upload session");
      }

      // Cache in Redis
      await this.cacheSession(session);

      logger.info({
        message: "Created upload session",
        sessionId: session.sessionId,
        instructorId: params.instructorId,
        courseId: params.courseId,
        fileSize: params.fileSize,
        totalChunks,
      });

      return session;
    } catch (error) {
      logger.error({
        message: "Failed to create upload session",
        error,
        params,
      });
      throw new DatabaseError("Failed to create upload session", {
        originalError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async getSession(sessionId: string): Promise<UploadSession | null> {
    try {
      // Try cache first
      const cached = await this.getCachedSession(sessionId);
      if (cached) {
        return cached;
      }

      // Fetch from database
      const result = await query<UploadSession>(
        `SELECT 
          session_id as "sessionId",
          instructor_id as "instructorId",
          course_id as "courseId",
          file_name as "fileName",
          file_size as "fileSize",
          mime_type as "mimeType",
          checksum,
          status,
          storage_key as "storageKey",
          upload_id as "uploadId",
          chunk_size as "chunkSize",
          total_chunks as "totalChunks",
          created_at as "createdAt",
          updated_at as "updatedAt",
          expires_at as "expiresAt",
          version
        FROM upload_sessions
        WHERE session_id = $1`,
        [sessionId]
      );

      const session = result.rows[0] || null;

      if (session) {
        // Cache for future requests
        await this.cacheSession(session);
      }

      return session;
    } catch (error) {
      logger.error({
        message: "Failed to get upload session",
        error,
        sessionId,
      });
      throw new DatabaseError("Failed to get upload session", {
        originalError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async updateSessionStatus(
    sessionId: string,
    newStatus: SessionStatus,
    uploadId?: string
  ): Promise<void> {
    try {
      await transaction(async (client: PoolClient) => {
        // Get current session with row lock
        const result = await client.query<{
          status: SessionStatus;
          version: number;
        }>(
          "SELECT status, version FROM upload_sessions WHERE session_id = $1 FOR UPDATE",
          [sessionId]
        );

        if (result.rows.length === 0) {
          throw new SessionNotFoundError(sessionId);
        }

        const currentStatus = result.rows[0]!.status;
        const currentVersion = result.rows[0]!.version;

        // Validate status transition (skip validation if status is not changing)
        if (
          currentStatus !== newStatus &&
          !canTransitionTo(currentStatus, newStatus)
        ) {
          throw new InvalidStatusTransitionError(currentStatus, newStatus);
        }

        // Update status with optimistic locking
        const updateResult = await client.query(
          `UPDATE upload_sessions 
           SET status = $1, version = version + 1, updated_at = NOW()
           ${uploadId ? ", upload_id = $4" : ""}
           WHERE session_id = $2 AND version = $3`,
          uploadId
            ? [newStatus, sessionId, currentVersion, uploadId]
            : [newStatus, sessionId, currentVersion]
        );

        if (updateResult.rowCount === 0) {
          throw new DatabaseError("Concurrent update detected, please retry");
        }
      });

      // Invalidate cache
      await this.invalidateCache(sessionId);

      logger.info({ message: "Updated session status", sessionId, newStatus });
    } catch (error) {
      if (
        error instanceof SessionNotFoundError ||
        error instanceof InvalidStatusTransitionError ||
        error instanceof DatabaseError
      ) {
        throw error;
      }

      logger.error({
        message: "Failed to update session status",
        error,
        sessionId,
        newStatus,
      });
      throw new DatabaseError("Failed to update session status", {
        originalError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async updateUploadId(sessionId: string, uploadId: string): Promise<void> {
    try {
      const result = await query(
        `UPDATE upload_sessions 
         SET upload_id = $1, updated_at = NOW()
         WHERE session_id = $2`,
        [uploadId, sessionId]
      );

      if (result.rowCount === 0) {
        throw new SessionNotFoundError(sessionId);
      }

      // Invalidate cache
      await this.invalidateCache(sessionId);

      logger.info({ message: "Updated upload ID", sessionId, uploadId });
    } catch (error) {
      if (error instanceof SessionNotFoundError) {
        throw error;
      }

      logger.error({
        message: "Failed to update upload ID",
        error,
        sessionId,
      });
      throw new DatabaseError("Failed to update upload ID", {
        originalError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async listSessions(
    instructorId: string,
    filters?: UploadSessionFilters,
    page: number = 1,
    limit: number = 20
  ): Promise<{ sessions: UploadSession[]; total: number }> {
    try {
      const offset = (page - 1) * limit;
      const conditions: string[] = ["instructor_id = $1"];
      const params: unknown[] = [instructorId];
      let paramIndex = 2;

      if (filters?.status) {
        conditions.push(`status = $${paramIndex}`);
        params.push(filters.status);
        paramIndex++;
      }

      if (filters?.createdAfter) {
        conditions.push(`created_at >= $${paramIndex}`);
        params.push(filters.createdAfter);
        paramIndex++;
      }

      if (filters?.createdBefore) {
        conditions.push(`created_at <= $${paramIndex}`);
        params.push(filters.createdBefore);
        paramIndex++;
      }

      const whereClause = conditions.join(" AND ");

      // Get total count
      const countResult = await query<{ count: string }>(
        `SELECT COUNT(*) as count FROM upload_sessions WHERE ${whereClause}`,
        params
      );

      const total = parseInt(countResult.rows[0]?.count || "0", 10);

      // Get paginated sessions
      const sessionsResult = await query<UploadSession>(
        `SELECT 
          session_id as "sessionId",
          instructor_id as "instructorId",
          course_id as "courseId",
          file_name as "fileName",
          file_size as "fileSize",
          mime_type as "mimeType",
          checksum,
          status,
          storage_key as "storageKey",
          upload_id as "uploadId",
          chunk_size as "chunkSize",
          total_chunks as "totalChunks",
          created_at as "createdAt",
          updated_at as "updatedAt",
          expires_at as "expiresAt",
          version
        FROM upload_sessions
        WHERE ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limit, offset]
      );

      return {
        sessions: sessionsResult.rows,
        total,
      };
    } catch (error) {
      logger.error({
        message: "Failed to list sessions",
        error,
        instructorId,
        filters,
      });
      throw new DatabaseError("Failed to list sessions", {
        originalError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async extendSessionTTL(sessionId: string): Promise<void> {
    try {
      const session = await this.getSession(sessionId);

      if (!session) {
        throw new SessionNotFoundError(sessionId);
      }

      if (new Date() > new Date(session.expiresAt)) {
        throw new SessionExpiredError(sessionId, new Date(session.expiresAt));
      }

      const newExpiresAt = new Date();
      newExpiresAt.setDate(newExpiresAt.getDate() + this.SESSION_EXPIRY_DAYS);

      await query(
        "UPDATE upload_sessions SET expires_at = $1, updated_at = NOW() WHERE session_id = $2",
        [newExpiresAt, sessionId]
      );

      // Invalidate cache
      await this.invalidateCache(sessionId);

      logger.info({ message: "Extended session TTL", sessionId, newExpiresAt });
    } catch (error) {
      if (
        error instanceof SessionNotFoundError ||
        error instanceof SessionExpiredError
      ) {
        throw error;
      }

      logger.error({
        message: "Failed to extend session TTL",
        error,
        sessionId,
      });
      throw new DatabaseError("Failed to extend session TTL", {
        originalError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async cleanupAbandonedSessions(): Promise<number> {
    try {
      const result = await query(
        `DELETE FROM upload_sessions 
         WHERE expires_at < NOW() 
         AND status IN ('pending', 'uploading', 'failed')
         RETURNING session_id`
      );

      const deletedCount = result.rowCount || 0;

      logger.info({ message: "Cleaned up abandoned sessions", deletedCount });

      return deletedCount;
    } catch (error) {
      logger.error({ message: "Failed to cleanup abandoned sessions", error });
      throw new DatabaseError("Failed to cleanup abandoned sessions", {
        originalError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async cacheSession(session: UploadSession): Promise<void> {
    if (!this.redisClient?.isOpen) return;

    try {
      const key = `upload:session:${session.sessionId}`;
      await this.redisClient.setEx(
        key,
        this.SESSION_CACHE_TTL,
        JSON.stringify(session)
      );
    } catch (error) {
      logger.warn({
        message: "Failed to cache session",
        error,
        sessionId: session.sessionId,
      });
    }
  }

  private async getCachedSession(
    sessionId: string
  ): Promise<UploadSession | null> {
    if (!this.redisClient?.isOpen) return null;

    try {
      const key = `upload:session:${sessionId}`;
      const cached = await this.redisClient.get(key);

      if (!cached) return null;

      return JSON.parse(cached) as UploadSession;
    } catch (error) {
      logger.warn({
        message: "Failed to get cached session",
        error,
        sessionId,
      });
      return null;
    }
  }

  private async invalidateCache(sessionId: string): Promise<void> {
    if (!this.redisClient?.isOpen) return;

    try {
      const key = `upload:session:${sessionId}`;
      await this.redisClient.del(key);
    } catch (error) {
      logger.warn({ message: "Failed to invalidate cache", error, sessionId });
    }
  }
}
