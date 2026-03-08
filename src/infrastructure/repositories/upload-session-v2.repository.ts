/**
 * Upload Session V2 Repository
 * 
 * Database operations for upload sessions
 */

import { query } from "../database/pool.js";
import {
  UploadSessionV2,
  CreateUploadSessionInput,
  UpdateUploadSessionInput,
  UploadSessionStatus,
} from "../../domain/models/upload-session-v2.model.js";

interface UploadSessionRow {
  id: string;
  instructor_id: string;
  status: UploadSessionStatus;
  file_count: number;
  total_size: string;
  folder_structure?: string;
  temp_storage_paths: string;
  suggested_structure?: string;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
}

const mapToUploadSession = (row: UploadSessionRow): UploadSessionV2 => ({
  id: row.id,
  instructorId: row.instructor_id,
  status: row.status,
  fileCount: row.file_count,
  totalSize: parseInt(row.total_size),
  folderStructure: row.folder_structure ? JSON.parse(row.folder_structure) : undefined,
  tempStoragePaths: JSON.parse(row.temp_storage_paths),
  suggestedStructure: row.suggested_structure ? JSON.parse(row.suggested_structure) : undefined,
  expiresAt: row.expires_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class UploadSessionV2Repository {
  /**
   * Create a new upload session
   */
  async createSession(input: CreateUploadSessionInput): Promise<UploadSessionV2> {
    const result = await query<UploadSessionRow>(
      `INSERT INTO upload_sessions_v2 
        (instructor_id, file_count, total_size, folder_structure, temp_storage_paths, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.instructorId,
        input.fileCount,
        input.totalSize,
        input.folderStructure ? JSON.stringify(input.folderStructure) : null,
        JSON.stringify(input.tempStoragePaths),
        input.expiresAt,
      ]
    );

    if (!result.rows[0]) {
      throw new Error("Failed to create upload session");
    }

    return mapToUploadSession(result.rows[0]);
  }

  /**
   * Update an upload session
   */
  async updateSession(sessionId: string, updates: UpdateUploadSessionInput): Promise<UploadSessionV2> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.status !== undefined) {
      setClauses.push(`status = $${paramIndex++}`);
      values.push(updates.status);
    }

    if (updates.fileCount !== undefined) {
      setClauses.push(`file_count = $${paramIndex++}`);
      values.push(updates.fileCount);
    }

    if (updates.totalSize !== undefined) {
      setClauses.push(`total_size = $${paramIndex++}`);
      values.push(updates.totalSize);
    }

    if (updates.tempStoragePaths !== undefined) {
      setClauses.push(`temp_storage_paths = $${paramIndex++}`);
      values.push(JSON.stringify(updates.tempStoragePaths));
    }

    if (updates.suggestedStructure !== undefined) {
      setClauses.push(`suggested_structure = $${paramIndex++}`);
      values.push(JSON.stringify(updates.suggestedStructure));
    }

    if (setClauses.length === 0) {
      throw new Error("No fields to update");
    }

    values.push(sessionId);

    const result = await query<UploadSessionRow>(
      `UPDATE upload_sessions_v2
       SET ${setClauses.join(", ")}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    if (!result.rows[0]) {
      throw new Error("Upload session not found");
    }

    return mapToUploadSession(result.rows[0]);
  }

  /**
   * Get session by ID
   */
  async getSessionById(sessionId: string): Promise<UploadSessionV2 | null> {
    const result = await query<UploadSessionRow>(
      "SELECT * FROM upload_sessions_v2 WHERE id = $1",
      [sessionId]
    );

    return result.rows[0] ? mapToUploadSession(result.rows[0]) : null;
  }

  /**
   * Get active sessions for an instructor
   */
  async getActiveSessionsByInstructor(instructorId: string): Promise<UploadSessionV2[]> {
    const result = await query<UploadSessionRow>(
      `SELECT * FROM upload_sessions_v2
       WHERE instructor_id = $1 
         AND status IN ('uploading', 'analyzing')
         AND expires_at > CURRENT_TIMESTAMP
       ORDER BY created_at DESC`,
      [instructorId]
    );

    return result.rows.map(mapToUploadSession);
  }

  /**
   * Delete expired sessions
   */
  async deleteExpiredSessions(): Promise<number> {
    const result = await query(
      "DELETE FROM upload_sessions_v2 WHERE expires_at < CURRENT_TIMESTAMP"
    );

    return result.rowCount || 0;
  }

  /**
   * Delete session by ID
   */
  async deleteSession(sessionId: string): Promise<void> {
    await query(
      "DELETE FROM upload_sessions_v2 WHERE id = $1",
      [sessionId]
    );
  }
}

export const createUploadSessionV2Repository = (): UploadSessionV2Repository => {
  return new UploadSessionV2Repository();
};
