import { Queue, Worker } from "bullmq";
import { createModuleLogger } from "../../shared/logger.js";
import { config } from "../../shared/config.js";
import { isDatabaseReady, query } from "../database/pool.js";

const log = createModuleLogger("db-keepalive");

const QUEUE_NAME = "db-keepalive";
const JOB_NAME = "ping";

const PING_INTERVAL_MS = 30 * 60 * 1000; // 30 minute

const redisConnection = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password ?? undefined,
};

export const startDbKeepaliveScheduler = async (): Promise<void> => {
  const keepaliveQueue = new Queue(QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
      removeOnComplete: 5,
      removeOnFail: 10,
    },
  });

  await keepaliveQueue.upsertJobScheduler(
    "db-keepalive-repeat",
    { every: PING_INTERVAL_MS },
    {
      name: JOB_NAME,
      data: {},
      opts: {
        removeOnComplete: 5,
        removeOnFail: 10,
      },
    }
  );

  log.info(
    { intervalMinutes: 30 },
    "DB keepalive scheduler registered — will ping every 30 minutes"
  );

  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      if (!isDatabaseReady()) {
        log.warn("DB keepalive skipped — database not yet connected");
        return;
      }

      const start = Date.now();
      await query("SELECT 1");
      log.info(
        { durationMs: Date.now() - start },
        "DB keepalive ping successful"
      );
    },
    {
      connection: redisConnection,
      concurrency: 1,
    }
  );

  worker.on("failed", (job, err) => {
    log.error({ jobId: job?.id, err }, "DB keepalive job failed");
  });

  log.info("DB keepalive worker started");
};
