import { Pool } from "pg";
import { CostOptimizer } from "../../application/services/cost-optimizer.service";
import { logger } from "../../shared/logger";

export class StorageTieringJob {
  constructor(
    private pool: Pool,
    private costOptimizer: CostOptimizer
  ) {}

  async execute(): Promise<void> {
    logger.info("Starting storage tiering job");

    try {
      const result = await this.costOptimizer.runTieringJob();

      logger.info({
        message: "Storage tiering job completed",
        movedToInfrequentAccess: result.movedToInfrequentAccess,
        movedToArchive: result.movedToArchive,
        estimatedSavings: result.estimatedSavings,
      });

      // Log savings to cost_records
      if (result.estimatedSavings > 0) {
        const month = new Date().toISOString().slice(0, 7);
        await this.pool.query(
          `INSERT INTO cost_records (
            instructor_id, cost_type, cost_usd, details, recorded_at, month
          ) VALUES ($1, $2, $3, $4, NOW(), $5)`,
          [
            "00000000-0000-0000-0000-000000000000", // System-level savings
            "storage",
            -result.estimatedSavings, // Negative cost = savings
            JSON.stringify({
              type: "tiering_savings",
              movedToInfrequentAccess: result.movedToInfrequentAccess,
              movedToArchive: result.movedToArchive,
            }),
            month,
          ]
        );
      }
    } catch (error) {
      logger.error({ message: "Storage tiering job failed", error });
      throw error;
    }
  }
}
