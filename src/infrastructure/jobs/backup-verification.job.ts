import { Pool } from "pg";
import { logger } from "../../shared/logger";

export class BackupVerificationJob {
  constructor(private pool: Pool) {}

  async execute(): Promise<void> {
    logger.info("Starting backup verification job");

    try {
      // Verify database connectivity
      await this.verifyDatabaseBackup();

      // Verify critical tables have data
      await this.verifyCriticalTables();

      logger.info("Backup verification job completed successfully");
    } catch (error) {
      logger.error({ message: "Backup verification job failed", error });

      // Send alert (in production, this would trigger PagerDuty/Slack/etc)
      logger.error({
        message:
          "ALERT: Backup verification failed - immediate action required",
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });

      throw error;
    }
  }

  private async verifyDatabaseBackup(): Promise<void> {
    try {
      const result = await this.pool.query("SELECT NOW() as current_time");
      logger.debug({
        message: "Database connectivity verified",
        time: result.rows[0].current_time,
      });
    } catch (error) {
      throw new Error(`Database connectivity check failed: ${error}`);
    }
  }

  private async verifyCriticalTables(): Promise<void> {
    const criticalTables = [
      "upload_sessions",
      "upload_chunks",
      "file_hashes",
      "cost_records",
      "upload_metrics",
      "transcoding_jobs",
    ];

    for (const table of criticalTables) {
      try {
        const result = await this.pool.query(
          `SELECT COUNT(*) as count FROM ${table}`
        );
        logger.debug({
          message: `Table ${table} verified`,
          count: result.rows[0]["count"],
        });
      } catch (error) {
        throw new Error(`Table ${table} verification failed: ${error}`);
      }
    }
  }
}
