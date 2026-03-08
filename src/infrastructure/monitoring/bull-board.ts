import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { Queue } from "bullmq";
import { createModuleLogger } from "../../shared/logger.js";

const log = createModuleLogger("bull-board");

export interface BullBoardConfig {
  basePath?: string;
  queues: Queue[];
}

/**
 * Create Bull Board dashboard
 */
export const createBullBoardDashboard = (config: BullBoardConfig) => {
  const { basePath = "/admin/queues", queues } = config;

  // Create Express adapter
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath(basePath);

  // Create Bull Board with queue adapters
  const bullBoard = createBullBoard({
    queues: queues.map((queue) => new BullMQAdapter(queue)),
    serverAdapter,
  });

  log.info(
    { basePath, queueCount: queues.length },
    "Bull Board dashboard initialized"
  );

  return {
    router: serverAdapter.getRouter(),
    bullBoard,
  };
};

/**
 * Add a queue to an existing Bull Board instance
 */
export const addQueueToBullBoard = (
  bullBoard: ReturnType<typeof createBullBoard>,
  queue: Queue
) => {
  bullBoard.addQueue(new BullMQAdapter(queue));
  log.info({ queueName: queue.name }, "Queue added to Bull Board");
};

/**
 * Remove a queue from Bull Board
 */
export const removeQueueFromBullBoard = (
  bullBoard: ReturnType<typeof createBullBoard>,
  queueName: string
) => {
  bullBoard.removeQueue(queueName);
  log.info({ queueName }, "Queue removed from Bull Board");
};
