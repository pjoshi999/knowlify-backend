import { Pool } from "pg";
import { CostOptimizer } from "../../application/services/cost-optimizer.service";
import { logger } from "../../shared/logger";

export class DeletionQueueProcessorJob {
  constructor(
    // @ts-expect-error - Pool reserved for future direct database operations
    private _pool: Pool,
    private costOptimizer: CostOptimizer
  ) {}

  async execute(): Promise<void> {
    logger.info("Starting deletion queue processor job");

    try {
      const deletedCount = await this.costOptimizer.processDeletionQueue();

      logger.info({
        message: "Deletion queue processor job completed",
        deletedCount,
      });
    } catch (error) {
      logger.error({ message: "Deletion queue processor job failed", error });
      throw error;
    }
  }
}
