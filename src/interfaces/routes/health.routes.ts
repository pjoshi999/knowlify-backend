import { Router, Request, Response } from "express";
import { Pool } from "pg";
import { RedisClientType } from "redis";
import { S3Client, HeadBucketCommand } from "@aws-sdk/client-s3";
import { SQSClient, GetQueueAttributesCommand } from "@aws-sdk/client-sqs";
import { logger } from "../../shared/logger";

interface HealthCheckDependencies {
  pool: Pool;
  redisClient: RedisClientType;
  s3Client: S3Client;
  sqsClient: SQSClient;
  bucketName: string;
  queueUrl: string;
}

export function createHealthRoutes(deps: HealthCheckDependencies): Router {
  const router = Router();

  // Basic health check
  router.get("/health", async (_req: Request, res: Response) => {
    try {
      const checks = await Promise.allSettled([
        checkDatabase(deps.pool),
        checkRedis(deps.redisClient),
        checkS3(deps.s3Client, deps.bucketName),
        checkSQS(deps.sqsClient, deps.queueUrl),
      ]);

      const [database, redis, s3, sqs] = checks;

      const allHealthy = checks.every((check) => check.status === "fulfilled");

      const response = {
        status: allHealthy ? "healthy" : "degraded",
        timestamp: new Date().toISOString(),
        checks: {
          database: database.status === "fulfilled" ? "healthy" : "unhealthy",
          redis: redis.status === "fulfilled" ? "healthy" : "unhealthy",
          s3: s3.status === "fulfilled" ? "healthy" : "unhealthy",
          sqs: sqs.status === "fulfilled" ? "healthy" : "unhealthy",
        },
      };

      res.status(allHealthy ? 200 : 503).json(response);
    } catch (error) {
      logger.error({ message: "Health check failed",  error });
      res.status(503).json({
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: "Health check failed",
      });
    }
  });

  // Kubernetes readiness probe
  router.get("/ready", async (_req: Request, res: Response) => {
    try {
      // Check critical dependencies only
      await checkDatabase(deps.pool);
      await checkRedis(deps.redisClient);

      res.status(200).json({
        status: "ready",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error({ message: "Readiness check failed",  error });
      res.status(503).json({
        status: "not ready",
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Kubernetes liveness probe
  router.get("/live", (_req: Request, res: Response) => {
    res.status(200).json({
      status: "alive",
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}

async function checkDatabase(pool: Pool): Promise<void> {
  const result = await pool.query("SELECT NOW()");
  if (!result.rows[0]) {
    throw new Error("Database query returned no results");
  }
}

async function checkRedis(redisClient: RedisClientType): Promise<void> {
  const pong = await redisClient.ping();
  if (pong !== "PONG") {
    throw new Error("Redis ping failed");
  }
}

async function checkS3(s3Client: S3Client, bucketName: string): Promise<void> {
  const command = new HeadBucketCommand({ Bucket: bucketName });
  await s3Client.send(command);
}

async function checkSQS(sqsClient: SQSClient, queueUrl: string): Promise<void> {
  if (!queueUrl) {
    // SQS is optional, skip check if not configured
    return;
  }

  const command = new GetQueueAttributesCommand({
    QueueUrl: queueUrl,
    AttributeNames: ["ApproximateNumberOfMessages"],
  });
  await sqsClient.send(command);
}
