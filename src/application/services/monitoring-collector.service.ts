import { Counter, Histogram, Gauge, Registry } from "prom-client";
import { Pool } from "pg";
import { logger } from "../../shared/logger";

interface UploadMetric {
  sessionId: string;
  instructorId: string;
  instructorTier: "premium" | "standard" | "free";
  region?: string;
  fileSize: number;
  uploadDuration?: number;
  averageSpeed?: number;
  status: "success" | "failed";
  failureReason?: string;
}

interface CostMetric {
  instructorId: string;
  courseId?: string;
  costType: "storage" | "bandwidth" | "transcoding";
  costUsd: number;
  details?: Record<string, any>;
}

interface SystemMetrics {
  activeUploads: number;
  queueDepth: number;
  averageUploadSpeed: number;
  successRate: number;
  totalStorageUsed: number;
}

interface AlertThresholds {
  successRateMin: number;
  uploadTimeMultiplier: number;
  costBudgetUsd: number;
  storageUsagePercent: number;
}

export class MonitoringCollectorService {
  private registry: Registry;
  private uploadStartedCounter!: Counter;
  private uploadCompletedCounter!: Counter;
  private uploadFailedCounter!: Counter;
  private chunkUploadedCounter!: Counter;
  private uploadDurationHistogram!: Histogram;
  private uploadSpeedHistogram!: Histogram;
  private storageCostGauge!: Gauge;
  private bandwidthCostGauge!: Gauge;
  private transcodingCostGauge!: Gauge;
  private activeUploadsGauge!: Gauge;
  private queueDepthGauge!: Gauge;

  private alertThresholds: AlertThresholds = {
    successRateMin: 0.95,
    uploadTimeMultiplier: 2,
    costBudgetUsd: 10000,
    storageUsagePercent: 70,
  };

  constructor(private pool: Pool) {
    this.registry = new Registry();
    this.initializeMetrics();
  }

  private initializeMetrics(): void {
    // Upload counters
    this.uploadStartedCounter = new Counter({
      name: "video_upload_started_total",
      help: "Total number of video uploads started",
      labelNames: ["instructor_tier", "region"],
      registers: [this.registry],
    });

    this.uploadCompletedCounter = new Counter({
      name: "video_upload_completed_total",
      help: "Total number of video uploads completed successfully",
      labelNames: ["instructor_tier", "region"],
      registers: [this.registry],
    });

    this.uploadFailedCounter = new Counter({
      name: "video_upload_failed_total",
      help: "Total number of video uploads failed",
      labelNames: ["instructor_tier", "region", "failure_reason"],
      registers: [this.registry],
    });

    this.chunkUploadedCounter = new Counter({
      name: "video_chunk_uploaded_total",
      help: "Total number of video chunks uploaded",
      labelNames: ["instructor_tier"],
      registers: [this.registry],
    });

    // Upload histograms
    this.uploadDurationHistogram = new Histogram({
      name: "video_upload_duration_seconds",
      help: "Video upload duration in seconds",
      labelNames: ["instructor_tier", "file_size_bucket"],
      buckets: [60, 300, 600, 1800, 3600, 7200, 14400], // 1m, 5m, 10m, 30m, 1h, 2h, 4h
      registers: [this.registry],
    });

    this.uploadSpeedHistogram = new Histogram({
      name: "video_upload_speed_bytes_per_second",
      help: "Video upload speed in bytes per second",
      labelNames: ["instructor_tier", "region"],
      buckets: [1e6, 5e6, 10e6, 50e6, 100e6, 500e6, 1e9], // 1MB/s to 1GB/s
      registers: [this.registry],
    });

    // Cost gauges
    this.storageCostGauge = new Gauge({
      name: "video_storage_cost_usd",
      help: "Current storage cost in USD",
      labelNames: ["instructor_id", "month"],
      registers: [this.registry],
    });

    this.bandwidthCostGauge = new Gauge({
      name: "video_bandwidth_cost_usd",
      help: "Current bandwidth cost in USD",
      labelNames: ["instructor_id", "month"],
      registers: [this.registry],
    });

    this.transcodingCostGauge = new Gauge({
      name: "video_transcoding_cost_usd",
      help: "Current transcoding cost in USD",
      labelNames: ["instructor_id", "month"],
      registers: [this.registry],
    });

    // System gauges
    this.activeUploadsGauge = new Gauge({
      name: "video_active_uploads",
      help: "Number of currently active uploads",
      registers: [this.registry],
    });

    this.queueDepthGauge = new Gauge({
      name: "video_queue_depth",
      help: "Number of uploads waiting in queue",
      registers: [this.registry],
    });
  }

  async recordUploadStarted(
    instructorTier: "premium" | "standard" | "free",
    region?: string
  ): Promise<void> {
    this.uploadStartedCounter.inc({
      instructor_tier: instructorTier,
      region: region || "unknown",
    });
  }

  async recordUploadCompleted(metric: UploadMetric): Promise<void> {
    const { instructorTier, region, fileSize, uploadDuration, averageSpeed } =
      metric;

    this.uploadCompletedCounter.inc({
      instructor_tier: instructorTier,
      region: region || "unknown",
    });

    if (uploadDuration) {
      const fileSizeBucket = this.getFileSizeBucket(fileSize);
      this.uploadDurationHistogram.observe(
        { instructor_tier: instructorTier, file_size_bucket: fileSizeBucket },
        uploadDuration
      );
    }

    if (averageSpeed) {
      this.uploadSpeedHistogram.observe(
        { instructor_tier: instructorTier, region: region || "unknown" },
        averageSpeed
      );
    }

    // Store in database for historical analysis
    await this.storeUploadMetric({ ...metric, status: "success" });
  }

  async recordUploadFailed(metric: UploadMetric): Promise<void> {
    const { instructorTier, region, failureReason } = metric;

    this.uploadFailedCounter.inc({
      instructor_tier: instructorTier,
      region: region || "unknown",
      failure_reason: failureReason || "unknown",
    });

    // Store in database
    await this.storeUploadMetric({ ...metric, status: "failed" });

    // Check alert thresholds
    await this.checkAlerts();
  }

  async recordChunkUploaded(
    instructorTier: "premium" | "standard" | "free"
  ): Promise<void> {
    this.chunkUploadedCounter.inc({ instructor_tier: instructorTier });
  }

  async recordStorageCost(metric: CostMetric): Promise<void> {
    const {
      instructorId,
      courseId: _courseId,
      costUsd,
      details: _details,
    } = metric;
    const month = new Date().toISOString().slice(0, 7); // YYYY-MM

    this.storageCostGauge.set({ instructor_id: instructorId, month }, costUsd);

    await this.storeCostMetric({ ...metric, costType: "storage" });
  }

  async recordBandwidthCost(metric: CostMetric): Promise<void> {
    const {
      instructorId,
      courseId: _courseId,
      costUsd,
      details: _details,
    } = metric;
    const month = new Date().toISOString().slice(0, 7);

    this.bandwidthCostGauge.set(
      { instructor_id: instructorId, month },
      costUsd
    );

    await this.storeCostMetric({ ...metric, costType: "bandwidth" });
  }

  async recordTranscodingCost(metric: CostMetric): Promise<void> {
    const {
      instructorId,
      courseId: _courseId,
      costUsd,
      details: _details,
    } = metric;
    const month = new Date().toISOString().slice(0, 7);

    this.transcodingCostGauge.set(
      { instructor_id: instructorId, month },
      costUsd
    );

    await this.storeCostMetric({ ...metric, costType: "transcoding" });
  }

  async getUploadMetrics(
    instructorId?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<any> {
    const query = `
      SELECT 
        instructor_tier,
        region,
        COUNT(*) as total_uploads,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful_uploads,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_uploads,
        AVG(upload_duration) as avg_duration_seconds,
        AVG(average_speed) as avg_speed_bytes_per_second,
        SUM(file_size) as total_bytes_uploaded
      FROM upload_metrics
      WHERE ($1::uuid IS NULL OR instructor_id = $1)
        AND ($2::timestamp IS NULL OR recorded_at >= $2)
        AND ($3::timestamp IS NULL OR recorded_at <= $3)
      GROUP BY instructor_tier, region
      ORDER BY total_uploads DESC
    `;

    const result = await this.pool.query(query, [
      instructorId,
      startDate,
      endDate,
    ]);
    return result.rows;
  }

  async getSystemMetrics(): Promise<SystemMetrics> {
    // Get active uploads count
    const activeUploadsResult = await this.pool.query(
      `SELECT COUNT(*) as count FROM upload_sessions WHERE status IN ('pending', 'uploading')`
    );
    const activeUploads = parseInt(activeUploadsResult.rows[0].count);

    // Get queue depth (would come from Redis in real implementation)
    const queueDepth = 0; // Placeholder

    // Get average upload speed from last 24 hours
    const speedResult = await this.pool.query(
      `SELECT AVG(average_speed) as avg_speed 
       FROM upload_metrics 
       WHERE recorded_at >= NOW() - INTERVAL '24 hours' AND status = 'success'`
    );
    const averageUploadSpeed = parseFloat(speedResult.rows[0].avg_speed) || 0;

    // Get success rate from last 24 hours
    const successRateResult = await this.pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE status = 'success') as success_count,
        COUNT(*) as total_count
       FROM upload_metrics 
       WHERE recorded_at >= NOW() - INTERVAL '24 hours'`
    );
    const { success_count, total_count } = successRateResult.rows[0];
    const successRate = total_count > 0 ? success_count / total_count : 1;

    // Get total storage used
    const storageResult = await this.pool.query(
      `SELECT SUM(file_size) as total_storage FROM upload_sessions WHERE status = 'completed'`
    );
    const totalStorageUsed = parseInt(storageResult.rows[0].total_storage) || 0;

    // Update gauges
    this.activeUploadsGauge.set(activeUploads);
    this.queueDepthGauge.set(queueDepth);

    return {
      activeUploads,
      queueDepth,
      averageUploadSpeed,
      successRate,
      totalStorageUsed,
    };
  }

  async getCostMetrics(instructorId?: string, month?: string): Promise<any> {
    const currentMonth = month || new Date().toISOString().slice(0, 7);

    const query = `
      SELECT 
        instructor_id,
        cost_type,
        SUM(cost_usd) as total_cost_usd,
        COUNT(*) as record_count
      FROM cost_records
      WHERE ($1::uuid IS NULL OR instructor_id = $1)
        AND month = $2
      GROUP BY instructor_id, cost_type
      ORDER BY total_cost_usd DESC
    `;

    const result = await this.pool.query(query, [instructorId, currentMonth]);
    return result.rows;
  }

  getMetricsRegistry(): Registry {
    return this.registry;
  }

  async getMetricsText(): Promise<string> {
    return this.registry.metrics();
  }

  private async storeUploadMetric(metric: UploadMetric): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO upload_metrics (
          session_id, instructor_id, instructor_tier, region, file_size,
          upload_duration, average_speed, status, failure_reason, recorded_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
        [
          metric.sessionId,
          metric.instructorId,
          metric.instructorTier,
          metric.region,
          metric.fileSize,
          metric.uploadDuration,
          metric.averageSpeed,
          metric.status,
          metric.failureReason,
        ]
      );
    } catch (error) {
      logger.error({ message: "Failed to store upload metric", error, metric });
    }
  }

  private async storeCostMetric(metric: CostMetric): Promise<void> {
    try {
      const month = new Date().toISOString().slice(0, 7);
      await this.pool.query(
        `INSERT INTO cost_records (
          instructor_id, course_id, cost_type, cost_usd, details, recorded_at, month
        ) VALUES ($1, $2, $3, $4, $5, NOW(), $6)`,
        [
          metric.instructorId,
          metric.courseId,
          metric.costType,
          metric.costUsd,
          metric.details ? JSON.stringify(metric.details) : null,
          month,
        ]
      );
    } catch (error) {
      logger.error({ message: "Failed to store cost metric", error, metric });
    }
  }

  private getFileSizeBucket(fileSize: number): string {
    const gb = fileSize / (1024 * 1024 * 1024);
    if (gb < 1) return "<1GB";
    if (gb < 5) return "1-5GB";
    if (gb < 10) return "5-10GB";
    if (gb < 50) return "10-50GB";
    return ">50GB";
  }

  private async checkAlerts(): Promise<void> {
    const metrics = await this.getSystemMetrics();

    // Check success rate
    if (metrics.successRate < this.alertThresholds.successRateMin) {
      logger.warn({
        message: "Upload success rate below threshold",
        currentRate: metrics.successRate,
        threshold: this.alertThresholds.successRateMin,
      });
    }

    // Check storage usage
    const storageUsagePercent =
      (metrics.totalStorageUsed / (1024 * 1024 * 1024 * 1024 * 100)) * 100; // Assuming 100TB limit
    if (storageUsagePercent > this.alertThresholds.storageUsagePercent) {
      logger.warn({
        message: "Storage usage above threshold",
        currentUsage: storageUsagePercent,
        threshold: this.alertThresholds.storageUsagePercent,
      });
    }

    // Check cost budget
    const costMetrics = await this.getCostMetrics();
    const totalCost = costMetrics.reduce(
      (sum: number, m: any) => sum + parseFloat(m.total_cost_usd),
      0
    );
    if (totalCost > this.alertThresholds.costBudgetUsd) {
      logger.warn({
        message: "Cost budget exceeded",
        currentCost: totalCost,
        budget: this.alertThresholds.costBudgetUsd,
      });
    }
  }
}
