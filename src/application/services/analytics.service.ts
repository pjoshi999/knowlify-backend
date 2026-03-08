import { Pool } from "pg";
import { logger } from "../../shared/logger";

interface StorageUsage {
  totalBytes: number;
  totalFiles: number;
  byStatus: Record<string, number>;
}

interface UploadSpeed {
  averageBytesPerSecond: number;
  medianBytesPerSecond: number;
  p95BytesPerSecond: number;
}

interface SuccessRate {
  successCount: number;
  failureCount: number;
  totalCount: number;
  rate: number;
}

interface UploadTimeRecommendation {
  recommendedHour: number;
  averageSpeed: number;
  congestionLevel: "low" | "medium" | "high";
  reason: string;
}

interface CostBreakdown {
  storageCost: number;
  bandwidthCost: number;
  transcodingCost: number;
  totalCost: number;
  breakdown: Array<{
    type: string;
    cost: number;
    percentage: number;
  }>;
}

interface TranscodingMetrics {
  queueDepth: number;
  averageProcessingTime: number;
  estimatedWaitTime: number;
}

export class AnalyticsService {
  constructor(private pool: Pool) {}

  async getInstructorStorageUsage(instructorId: string): Promise<StorageUsage> {
    try {
      const result = await this.pool.query(
        `SELECT 
          COUNT(*) as total_files,
          SUM(file_size) as total_bytes,
          status,
          SUM(file_size) as status_bytes
         FROM upload_sessions
         WHERE instructor_id = $1
         GROUP BY status`,
        [instructorId]
      );

      const totalBytes = result.rows.reduce(
        (sum, row) => sum + parseInt(row.status_bytes),
        0
      );
      const totalFiles = result.rows.reduce(
        (sum, row) => sum + parseInt(row.total_files),
        0
      );
      const byStatus: Record<string, number> = {};

      result.rows.forEach((row) => {
        byStatus[row.status] = parseInt(row.status_bytes);
      });

      return {
        totalBytes,
        totalFiles,
        byStatus,
      };
    } catch (error) {
      logger.error({
        message: "Failed to get instructor storage usage",
        error,
        instructorId,
      });
      throw error;
    }
  }

  async getInstructorAverageUploadSpeed(
    instructorId: string
  ): Promise<UploadSpeed> {
    try {
      const result = await this.pool.query(
        `SELECT 
          AVG(average_speed) as avg_speed,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY average_speed) as median_speed,
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY average_speed) as p95_speed
         FROM upload_metrics
         WHERE instructor_id = $1 
           AND status = 'success'
           AND average_speed IS NOT NULL
           AND recorded_at >= NOW() - INTERVAL '30 days'`,
        [instructorId]
      );

      const row = result.rows[0];

      return {
        averageBytesPerSecond: parseFloat(row.avg_speed) || 0,
        medianBytesPerSecond: parseFloat(row.median_speed) || 0,
        p95BytesPerSecond: parseFloat(row.p95_speed) || 0,
      };
    } catch (error) {
      logger.error({
        message: "Failed to get instructor average upload speed",
        error,
        instructorId,
      });
      throw error;
    }
  }

  async getInstructorSuccessRate(instructorId: string): Promise<SuccessRate> {
    try {
      const result = await this.pool.query(
        `SELECT 
          COUNT(*) FILTER (WHERE status = 'success') as success_count,
          COUNT(*) FILTER (WHERE status = 'failed') as failure_count,
          COUNT(*) as total_count
         FROM upload_metrics
         WHERE instructor_id = $1
           AND recorded_at >= NOW() - INTERVAL '30 days'`,
        [instructorId]
      );

      const row = result.rows[0];
      const successCount = parseInt(row.success_count);
      const failureCount = parseInt(row.failure_count);
      const totalCount = parseInt(row.total_count);
      const rate = totalCount > 0 ? successCount / totalCount : 1;

      return {
        successCount,
        failureCount,
        totalCount,
        rate,
      };
    } catch (error) {
      logger.error({
        message: "Failed to get instructor success rate",
        error,
        instructorId,
      });
      throw error;
    }
  }

  async generateUploadTimeRecommendations(
    instructorId: string
  ): Promise<UploadTimeRecommendation[]> {
    try {
      // Analyze upload speeds by hour of day
      const result = await this.pool.query(
        `SELECT 
          EXTRACT(HOUR FROM recorded_at) as hour,
          AVG(average_speed) as avg_speed,
          COUNT(*) as upload_count
         FROM upload_metrics
         WHERE instructor_id = $1
           AND status = 'success'
           AND average_speed IS NOT NULL
           AND recorded_at >= NOW() - INTERVAL '30 days'
         GROUP BY EXTRACT(HOUR FROM recorded_at)
         ORDER BY avg_speed DESC`,
        [instructorId]
      );

      if (result.rows.length === 0) {
        // No historical data, provide general recommendations
        return [
          {
            recommendedHour: 2,
            averageSpeed: 0,
            congestionLevel: "low",
            reason: "Off-peak hours typically have better upload speeds",
          },
          {
            recommendedHour: 14,
            averageSpeed: 0,
            congestionLevel: "medium",
            reason: "Afternoon hours usually have moderate traffic",
          },
        ];
      }

      // Calculate congestion levels
      const maxSpeed = Math.max(
        ...result.rows.map((r) => parseFloat(r.avg_speed))
      );
      const recommendations: UploadTimeRecommendation[] = result.rows
        .slice(0, 5)
        .map((row) => {
          const hour = parseInt(row.hour);
          const avgSpeed = parseFloat(row.avg_speed);
          const speedRatio = avgSpeed / maxSpeed;

          let congestionLevel: "low" | "medium" | "high";
          let reason: string;

          if (speedRatio > 0.8) {
            congestionLevel = "low";
            reason = "Historically fast upload speeds during this hour";
          } else if (speedRatio > 0.5) {
            congestionLevel = "medium";
            reason = "Moderate upload speeds during this hour";
          } else {
            congestionLevel = "high";
            reason = "Higher congestion during this hour";
          }

          return {
            recommendedHour: hour,
            averageSpeed: avgSpeed,
            congestionLevel,
            reason,
          };
        });

      return recommendations;
    } catch (error) {
      logger.error({
        message: "Failed to generate upload time recommendations",
        error,
        instructorId,
      });
      throw error;
    }
  }

  async getCourseStorageCostBreakdown(
    courseId: string
  ): Promise<CostBreakdown> {
    try {
      const month = new Date().toISOString().slice(0, 7);

      const result = await this.pool.query(
        `SELECT 
          cost_type,
          SUM(cost_usd) as total_cost
         FROM cost_records
         WHERE course_id = $1
           AND month = $2
         GROUP BY cost_type`,
        [courseId, month]
      );

      let storageCost = 0;
      let bandwidthCost = 0;
      let transcodingCost = 0;

      result.rows.forEach((row) => {
        const cost = parseFloat(row.total_cost);
        switch (row.cost_type) {
          case "storage":
            storageCost = cost;
            break;
          case "bandwidth":
            bandwidthCost = cost;
            break;
          case "transcoding":
            transcodingCost = cost;
            break;
        }
      });

      const totalCost = storageCost + bandwidthCost + transcodingCost;

      const breakdown = [
        {
          type: "storage",
          cost: storageCost,
          percentage: totalCost > 0 ? (storageCost / totalCost) * 100 : 0,
        },
        {
          type: "bandwidth",
          cost: bandwidthCost,
          percentage: totalCost > 0 ? (bandwidthCost / totalCost) * 100 : 0,
        },
        {
          type: "transcoding",
          cost: transcodingCost,
          percentage: totalCost > 0 ? (transcodingCost / totalCost) * 100 : 0,
        },
      ];

      return {
        storageCost,
        bandwidthCost,
        transcodingCost,
        totalCost,
        breakdown,
      };
    } catch (error) {
      logger.error({
        message: "Failed to get course storage cost breakdown",
        error,
        courseId,
      });
      throw error;
    }
  }

  async getTranscodingQueueAndProcessingTime(): Promise<TranscodingMetrics> {
    try {
      // Get queue depth
      const queueResult = await this.pool.query(
        `SELECT COUNT(*) as count FROM transcoding_jobs WHERE status = 'queued'`
      );
      const queueDepth = parseInt(queueResult.rows[0].count);

      // Get average processing time from last 100 completed jobs
      const processingResult = await this.pool.query(
        `SELECT AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_processing_time
         FROM transcoding_jobs
         WHERE status = 'completed'
           AND started_at IS NOT NULL
           AND completed_at IS NOT NULL
         ORDER BY completed_at DESC
         LIMIT 100`
      );

      const averageProcessingTime =
        parseFloat(processingResult.rows[0].avg_processing_time) || 0;

      // Estimate wait time based on queue depth and processing time
      const estimatedWaitTime = queueDepth * averageProcessingTime;

      return {
        queueDepth,
        averageProcessingTime,
        estimatedWaitTime,
      };
    } catch (error) {
      logger.error({
        message: "Failed to get transcoding queue and processing time",
        error,
      });
      throw error;
    }
  }
}
