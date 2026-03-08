import { createVideoAnalysisWorker } from "../infrastructure/queues/video-analysis.queue.js";
import { createOpenAIService } from "../infrastructure/services/openai.service.js";
import { createModuleLogger } from "../shared/logger.js";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const log = createModuleLogger("worker");

async function startWorker() {
  try {
    log.info("Starting video analysis worker...");

    // Validate required environment variables
    if (!process.env["OPENAI_API_KEY"]) {
      throw new Error("OPENAI_API_KEY environment variable is required");
    }

    // Initialize OpenAI service
    const openaiService = createOpenAIService(process.env["OPENAI_API_KEY"]);

    // Start worker
    const worker = createVideoAnalysisWorker(openaiService);

    log.info("Video analysis worker started successfully");

    // Graceful shutdown
    process.on("SIGTERM", async () => {
      log.info("SIGTERM received, closing worker...");
      await worker.close();
      process.exit(0);
    });

    process.on("SIGINT", async () => {
      log.info("SIGINT received, closing worker...");
      await worker.close();
      process.exit(0);
    });
  } catch (error) {
    log.error({ error }, "Failed to start worker");
    process.exit(1);
  }
}

startWorker();
