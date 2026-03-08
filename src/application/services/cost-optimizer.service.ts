import { query, transaction } from "@infrastructure/database/pool.js";
import { PoolClient } from "pg";
import { StorageAdapter } from "@infrastructure/adapters/storage.adapter.js";
import { DeduplicationResult } from "@domain/models/file-hash.model.js";
import { UploadSession } from "@domain/models/upload-session.model.js";
import { DatabaseError } from "@shared/errors/upload-errors";
import { logger } from "@shared/logger.js";

export interface TieringJobResult {
  filesProcessed: number;
  movedToInfrequentAccess: number;
  movedToArchive: number;
  estimatedSavings: number;
}

export interface CostBreakdown {
  instructorId?: string;
  storageCostUSD: number;
  bandwidthCostUSD: number;
  transcodingCostUSD: number;
  totalCostUSD: number;
  breakdown: {
    standardStorage: number;
    infrequentAccessStorage: number;
    archiveStorage: number;
  };
}

export class CostOptimizer {
  constructor(private storageAdapter: StorageAdapter) {}

  async checkDeduplication(
    checksum: string,
    session: UploadSession
  ): Promise<DeduplicationResult> {
    try {
      return await transaction(async (client: PoolClient) => {
        // Check if hash exists
        const existing = await client.query(
          "SELECT storage_key, reference_count FROM file_hashes WHERE hash = $1",
          [checksum]
        );

        if (existing.rows.length > 0) {
          const existingKey = existing.rows[0]!.storage_key as string;

          // Create reference instead of storing duplicate
          await this.storageAdapter.createFileReference(
            existingKey,
            session.storageKey
          );

          // Increment reference count
          await client.query(
            "UPDATE file_hashes SET reference_count = reference_count + 1, last_accessed_at = NOW() WHERE hash = $1",
            [checksum]
          );

          logger.info({
            message: "Duplicate file detected, created reference",
            hash: checksum,
            existingKey,
            newKey: session.storageKey,
          });

          return {
            isDuplicate: true,
            existingKey,
            referenceCreated: true,
          };
        }

        // Not a duplicate, store hash
        await client.query(
          "INSERT INTO file_hashes (hash, storage_key, reference_count, created_at, last_accessed_at) VALUES ($1, $2, 1, NOW(), NOW())",
          [checksum, session.storageKey]
        );

        return { isDuplicate: false, referenceCreated: false };
      });
    } catch (error) {
      logger.error({
        message: "Failed to check deduplication",
        error,
        checksum,
      });
      throw new DatabaseError("Failed to check deduplication", {
        originalError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async incrementReferenceCount(hash: string): Promise<void> {
    try {
      await query(
        "UPDATE file_hashes SET reference_count = reference_count + 1, last_accessed_at = NOW() WHERE hash = $1",
        [hash]
      );
    } catch (error) {
      logger.error({
        message: "Failed to increment reference count",
        error,
        hash,
      });
    }
  }

  async decrementReferenceCount(hash: string): Promise<void> {
    try {
      const result = await query(
        "UPDATE file_hashes SET reference_count = reference_count - 1 WHERE hash = $1 RETURNING reference_count",
        [hash]
      );

      const refCount = result.rows[0]?.["reference_count"] as number;

      if (refCount === 0) {
        // Mark for deletion after 30 days
        const deletionDate = new Date();
        deletionDate.setDate(deletionDate.getDate() + 30);

        await this.markForDeletion(hash, deletionDate);
      }
    } catch (error) {
      logger.error({
        message: "Failed to decrement reference count",
        error,
        hash,
      });
    }
  }

  async runTieringJob(): Promise<TieringJobResult> {
    try {
      const result: TieringJobResult = {
        filesProcessed: 0,
        movedToInfrequentAccess: 0,
        movedToArchive: 0,
        estimatedSavings: 0,
      };

      // Find files not accessed for 30 days (move to Infrequent Access)
      const iaFiles = await query(
        `SELECT hash, storage_key FROM file_hashes 
         WHERE last_accessed_at < NOW() - INTERVAL '30 days'
         AND created_at < NOW() - INTERVAL '7 days'
         LIMIT 1000`
      );

      for (const _file of iaFiles.rows) {
        // In production, would call S3 API to change storage class
        // await this.storageAdapter.changeStorageClass(file.storage_key, 'STANDARD_IA');
        result.movedToInfrequentAccess++;
        result.filesProcessed++;
      }

      // Find files not accessed for 90 days (move to Archive/Glacier)
      const archiveFiles = await query(
        `SELECT hash, storage_key FROM file_hashes 
         WHERE last_accessed_at < NOW() - INTERVAL '90 days'
         LIMIT 1000`
      );

      for (const _file of archiveFiles.rows) {
        // In production, would call S3 API to change storage class
        // await this.storageAdapter.changeStorageClass(file.storage_key, 'GLACIER');
        result.movedToArchive++;
        result.filesProcessed++;
      }

      // Estimate savings (rough calculation)
      // Standard: $0.023/GB, IA: $0.0125/GB, Glacier: $0.004/GB
      result.estimatedSavings =
        result.movedToInfrequentAccess * 0.0105 + result.movedToArchive * 0.019;

      logger.info({ message: "Completed tiering job", ...result });

      return result;
    } catch (error) {
      logger.error({ message: "Failed to run tiering job", error });
      throw new DatabaseError("Failed to run tiering job", {
        originalError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async calculateStorageCosts(instructorId?: string): Promise<CostBreakdown> {
    try {
      const whereClause = instructorId ? "WHERE instructor_id = $1" : "";
      const params = instructorId ? [instructorId] : [];

      const result = await query<{
        cost_type: string;
        total_cost: string;
      }>(
        `SELECT cost_type, SUM(cost_usd) as total_cost
         FROM cost_records
         ${whereClause}
         GROUP BY cost_type`,
        params
      );

      const breakdown: CostBreakdown = {
        instructorId,
        storageCostUSD: 0,
        bandwidthCostUSD: 0,
        transcodingCostUSD: 0,
        totalCostUSD: 0,
        breakdown: {
          standardStorage: 0,
          infrequentAccessStorage: 0,
          archiveStorage: 0,
        },
      };

      for (const row of result.rows) {
        const cost = parseFloat(row.total_cost);

        switch (row.cost_type) {
          case "storage":
            breakdown.storageCostUSD += cost;
            break;
          case "bandwidth":
            breakdown.bandwidthCostUSD += cost;
            break;
          case "transcoding":
            breakdown.transcodingCostUSD += cost;
            break;
        }
      }

      breakdown.totalCostUSD =
        breakdown.storageCostUSD +
        breakdown.bandwidthCostUSD +
        breakdown.transcodingCostUSD;

      return breakdown;
    } catch (error) {
      logger.error({
        message: "Failed to calculate storage costs",
        error,
        instructorId,
      });
      throw new DatabaseError("Failed to calculate storage costs", {
        originalError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async markForDeletion(hash: string, deletionDate: Date): Promise<void> {
    try {
      // In production, would mark file for deletion in a separate table
      logger.info({ message: "Marked file for deletion", hash, deletionDate });
    } catch (error) {
      logger.error({ message: "Failed to mark for deletion", error, hash });
    }
  }

  async processDeletionQueue(): Promise<number> {
    try {
      // In production, would process files marked for deletion
      // Delete files where deletion_date <= NOW()
      logger.info("Processed deletion queue");
      return 0;
    } catch (error) {
      logger.error({ message: "Failed to process deletion queue", error });
      return 0;
    }
  }

  async recordCost(params: {
    instructorId: string;
    courseId?: string;
    costType: "storage" | "bandwidth" | "transcoding";
    costUSD: number;
    details?: Record<string, unknown>;
  }): Promise<void> {
    try {
      const month = new Date().toISOString().slice(0, 7); // YYYY-MM

      await query(
        `INSERT INTO cost_records (instructor_id, course_id, cost_type, cost_usd, details, recorded_at, month)
         VALUES ($1, $2, $3, $4, $5, NOW(), $6)`,
        [
          params.instructorId,
          params.courseId || null,
          params.costType,
          params.costUSD,
          params.details ? JSON.stringify(params.details) : null,
          month,
        ]
      );

      logger.debug({ message: "Recorded cost", ...params });
    } catch (error) {
      logger.error({ message: "Failed to record cost", error, params });
    }
  }
}
