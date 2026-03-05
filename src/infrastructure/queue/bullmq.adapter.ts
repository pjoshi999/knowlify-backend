import { Queue } from "bullmq";
import type {
  QueuePort,
  JobData,
  JobOptions,
  JobStatus,
} from "../../application/ports/queue.port.js";
import { config } from "../../shared/config.js";

export const createBullMQAdapter = (): QueuePort => {
  const queues = new Map<string, Queue>();

  const getQueue = (queueName: string): Queue => {
    if (!queues.has(queueName)) {
      const queue = new Queue(queueName, {
        connection: {
          host: config.redis.host,
          port: config.redis.port,
          password: config.redis.password,
        },
      });
      queues.set(queueName, queue);
    }
    return queues.get(queueName)!;
  };

  const addJob = async (
    queueName: string,
    jobName: string,
    data: JobData,
    options?: JobOptions
  ): Promise<string> => {
    const queue = getQueue(queueName);

    const job = await queue.add(jobName, data, {
      priority: options?.priority,
      delay: options?.delay,
      attempts: options?.attempts ?? 3,
      backoff: options?.backoff
        ? {
            type: options.backoff.type,
            delay: options.backoff.delay,
          }
        : {
            type: "exponential",
            delay: 2000,
          },
      removeOnComplete: options?.removeOnComplete ?? 100,
      removeOnFail: options?.removeOnFail ?? false,
    });

    return job.id!;
  };

  const getJobStatus = async (
    queueName: string,
    jobId: string
  ): Promise<JobStatus | null> => {
    const queue = getQueue(queueName);
    const job = await queue.getJob(jobId);

    if (!job) {
      return null;
    }

    const state = await job.getState();
    const progress = job.progress;

    return {
      id: job.id!,
      state: state as JobStatus["state"],
      progress: typeof progress === "number" ? progress : undefined,
      result: job.returnvalue,
      error: job.failedReason,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
    };
  };

  const removeJob = async (queueName: string, jobId: string): Promise<void> => {
    const queue = getQueue(queueName);
    const job = await queue.getJob(jobId);
    if (job) {
      await job.remove();
    }
  };

  const getJobResult = async (
    queueName: string,
    jobId: string
  ): Promise<unknown> => {
    const queue = getQueue(queueName);
    const job = await queue.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }
    return job.returnvalue;
  };

  return {
    addJob,
    getJobStatus,
    removeJob,
    getJobResult,
  };
};
