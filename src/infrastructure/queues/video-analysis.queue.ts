/**
 * Video Analysis Queue
 *
 * Background job queue for AI-powered video content analysis
 */

import { Queue, Worker, Job } from "bullmq";
import { createModuleLogger } from "../../shared/logger.js";
import { OpenAIService } from "../services/openai.service.js";
import IORedis from "ioredis";

const log = createModuleLogger("video-analysis-queue");

export interface VideoAnalysisJob {
  sessionId: string;
  videoKey: string;
  instructorId: string;
  fileName: string;
}

export interface AnalysisProgress {
  sessionId: string;
  progress: number; // 0-100
  status:
    | "queued"
    | "downloading"
    | "transcribing"
    | "analyzing"
    | "completed"
    | "failed";
  message: string;
  result?: {
    title: string;
    description: string;
    topics: string[];
    difficulty: "beginner" | "intermediate" | "advanced";
    duration?: number;
  };
  error?: string;
}

// Redis connection
const connection = new IORedis({
  host: process.env["REDIS_HOST"] || "localhost",
  port: parseInt(process.env["REDIS_PORT"] || "6379"),
  maxRetriesPerRequest: null,
});

// Create queue
export const videoAnalysisQueue = new Queue<VideoAnalysisJob>(
  "video-analysis",
  {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
      removeOnComplete: {
        age: 24 * 3600, // Keep completed jobs for 24 hours
        count: 1000,
      },
      removeOnFail: {
        age: 7 * 24 * 3600, // Keep failed jobs for 7 days
      },
    },
  }
);

/**
 * Create and start the video analysis worker
 */
export const createVideoAnalysisWorker = (openaiService: OpenAIService) => {
  const worker = new Worker<VideoAnalysisJob, AnalysisProgress>(
    "video-analysis",
    async (job: Job<VideoAnalysisJob>) => {
      const { sessionId, videoKey, fileName } = job.data;

      log.info({ sessionId, videoKey }, "Starting video analysis");

      try {
        // Update progress: Queued
        await job.updateProgress({
          sessionId,
          progress: 0,
          status: "queued",
          message: "Analysis queued...",
        });

        // Step 1: Download video metadata (10%)
        await job.updateProgress({
          sessionId,
          progress: 10,
          status: "downloading",
          message: "Preparing video for analysis...",
        });

        await new Promise((resolve) => setTimeout(resolve, 1000)); // Simulate download

        // Step 2: Extract audio and transcribe (50%)
        await job.updateProgress({
          sessionId,
          progress: 30,
          status: "transcribing",
          message: "Transcribing video content...",
        });

        // TODO: Implement actual Whisper API transcription
        const mockTranscript = `This is a sample transcript for ${fileName}. 
        In this video, we cover important concepts about the topic.`;

        await new Promise((resolve) => setTimeout(resolve, 2000)); // Simulate transcription

        // Step 3: Analyze content with GPT-4 (80%)
        await job.updateProgress({
          sessionId,
          progress: 60,
          status: "analyzing",
          message: "Analyzing video content with AI...",
        });

        const analysisPrompt = `Analyze this video transcript and provide structured information:

Transcript:
${mockTranscript}

File name: ${fileName}

Provide a JSON response with:
{
  "title": "Suggested video title",
  "description": "2-3 sentence description of what the video covers",
  "topics": ["topic1", "topic2", "topic3"],
  "difficulty": "beginner|intermediate|advanced"
}`;

        const response = await openaiService.chat([
          {
            role: "system",
            content:
              "You are a video content analyzer. Analyze transcripts and return structured JSON only.",
          },
          {
            role: "user",
            content: analysisPrompt,
          },
        ]);

        // Parse AI response
        let cleanedResponse = response.trim();
        if (cleanedResponse.startsWith("```json")) {
          cleanedResponse = cleanedResponse
            .replace(/```json\n?/g, "")
            .replace(/```\n?/g, "");
        }

        const analysis = JSON.parse(cleanedResponse);

        // Step 4: Complete (100%)
        const result: AnalysisProgress = {
          sessionId,
          progress: 100,
          status: "completed",
          message: "Analysis complete!",
          result: {
            title: analysis.title || fileName,
            description: analysis.description || "No description available",
            topics: analysis.topics || [],
            difficulty: analysis.difficulty || "intermediate",
          },
        };

        await job.updateProgress(result);

        log.info({ sessionId, result }, "Video analysis completed");

        return result;
      } catch (error) {
        log.error({ sessionId, error }, "Video analysis failed");

        const failedResult: AnalysisProgress = {
          sessionId,
          progress: 0,
          status: "failed",
          message: "Analysis failed",
          error: error instanceof Error ? error.message : "Unknown error",
        };

        await job.updateProgress(failedResult);

        throw error;
      }
    },
    {
      connection,
      concurrency: 5, // Process up to 5 videos concurrently
      limiter: {
        max: 10, // Max 10 jobs per minute (rate limiting for OpenAI API)
        duration: 60000,
      },
    }
  );

  worker.on("completed", (job) => {
    log.info({ jobId: job.id, sessionId: job.data.sessionId }, "Job completed");
  });

  worker.on("failed", (job, err) => {
    log.error(
      { jobId: job?.id, sessionId: job?.data.sessionId, error: err },
      "Job failed"
    );
  });

  worker.on("progress", (job, progress) => {
    log.debug(
      { jobId: job.id, sessionId: job.data.sessionId, progress },
      "Job progress updated"
    );
  });

  log.info("Video analysis worker started");

  return worker;
};

/**
 * Enqueue a video for analysis
 */
export const enqueueVideoAnalysis = async (
  data: VideoAnalysisJob
): Promise<string> => {
  const job = await videoAnalysisQueue.add("analyze-video", data, {
    jobId: `analysis-${data.sessionId}`,
  });

  log.info(
    { jobId: job.id, sessionId: data.sessionId },
    "Video analysis job enqueued"
  );

  return job.id!;
};

/**
 * Get job progress
 */
export const getAnalysisProgress = async (
  sessionId: string
): Promise<AnalysisProgress | null> => {
  const jobId = `analysis-${sessionId}`;
  const job = await videoAnalysisQueue.getJob(jobId);

  if (!job) {
    return null;
  }

  const jobProgress = job.progress as AnalysisProgress;

  return (
    jobProgress || {
      sessionId,
      progress: 0,
      status: "queued",
      message: "Waiting to start...",
    }
  );
};
