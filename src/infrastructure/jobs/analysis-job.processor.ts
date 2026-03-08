/**
 * Analysis Job Processor
 *
 * Background job processor for AI content analysis
 * Handles video and PDF analysis with retry logic
 */

import { Worker, Job } from "bullmq";
import { AIContentAnalyzer } from "../services/ai-content-analyzer.service.js";
import { LessonAIAnalysisRepository } from "../repositories/lesson-ai-analysis.repository.js";
import { LessonRepository } from "../repositories/lesson.repository.js";
import { config } from "../../shared/config.js";
import { createModuleLogger } from "../../shared/logger.js";

const log = createModuleLogger("analysis-job-processor");

export interface AnalysisJobData {
  lessonId: string;
  assetUrl: string;
  assetType: "VIDEO" | "PDF";
  metadata?: {
    title: string;
    duration?: number;
    hasAudio?: boolean;
  };
}

export interface AnalysisJobResult {
  lessonId: string;
  success: boolean;
  analyzedAt: Date;
  error?: string;
}

const QUEUE_NAME = "ai-analysis";
const MAX_CONCURRENT_JOBS = 5;

export class AnalysisJobProcessor {
  private worker: Worker;

  constructor(
    private aiAnalyzer: AIContentAnalyzer,
    private analysisRepository: LessonAIAnalysisRepository,
    private lessonRepository: LessonRepository
  ) {
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job<AnalysisJobData>) => this.processJob(job),
      {
        connection: {
          host: config.redis.host,
          port: config.redis.port,
          password: config.redis.password,
        },
        concurrency: MAX_CONCURRENT_JOBS,
        limiter: {
          max: 10, // Max 10 jobs per duration
          duration: 60000, // 1 minute
        },
      }
    );

    this.worker.on("completed", (job) => {
      log.info(
        { jobId: job.id, lessonId: job.data.lessonId },
        "Analysis job completed"
      );
    });

    this.worker.on("failed", (job, error) => {
      log.error(
        { jobId: job?.id, lessonId: job?.data.lessonId, error },
        "Analysis job failed"
      );
    });

    log.info("Analysis job processor started");
  }

  /**
   * Process an analysis job
   */
  private async processJob(
    job: Job<AnalysisJobData>
  ): Promise<AnalysisJobResult> {
    const { lessonId, assetUrl, assetType, metadata } = job.data;

    log.info({ jobId: job.id, lessonId, assetType }, "Processing analysis job");

    try {
      // Update job progress
      await job.updateProgress(10);

      // Get lesson details if metadata not provided
      let lessonMetadata = metadata;
      if (!lessonMetadata) {
        const lesson = await this.lessonRepository.getLessonById(lessonId);
        if (!lesson) {
          throw new Error(`Lesson ${lessonId} not found`);
        }
        lessonMetadata = {
          title: lesson.title,
          duration: lesson.duration,
          hasAudio: true, // Assume true for videos
        };
      }

      await job.updateProgress(20);

      // Perform analysis based on asset type
      let analysis;
      if (assetType === "VIDEO") {
        analysis = await this.aiAnalyzer.analyzeVideoContent(assetUrl, {
          title: lessonMetadata.title,
          hasAudio: lessonMetadata.hasAudio ?? true,
          duration: lessonMetadata.duration,
        });
      } else if (assetType === "PDF") {
        analysis = await this.aiAnalyzer.analyzePDFContent(assetUrl);
      } else {
        throw new Error(`Unsupported asset type: ${assetType}`);
      }

      await job.updateProgress(80);

      // Store analysis results
      await this.analysisRepository.upsertAnalysis({
        lessonId,
        summary: analysis.summary,
        topics: analysis.topics,
        learningObjectives: analysis.learningObjectives,
        keyPoints: analysis.keyPoints,
        difficulty: analysis.difficulty,
        transcription:
          "transcription" in analysis
            ? (analysis.transcription as string | undefined)
            : undefined,
        analyzedAt: analysis.analyzedAt,
      });

      await job.updateProgress(100);

      log.info({ jobId: job.id, lessonId }, "Analysis completed successfully");

      return {
        lessonId,
        success: true,
        analyzedAt: analysis.analyzedAt,
      };
    } catch (error) {
      log.error({ jobId: job.id, lessonId, error }, "Analysis failed");

      return {
        lessonId,
        success: false,
        analyzedAt: new Date(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Close the worker
   */
  async close(): Promise<void> {
    await this.worker.close();
    log.info("Analysis job processor stopped");
  }
}

export const createAnalysisJobProcessor = (
  aiAnalyzer: AIContentAnalyzer,
  analysisRepository: LessonAIAnalysisRepository,
  lessonRepository: LessonRepository
): AnalysisJobProcessor => {
  return new AnalysisJobProcessor(
    aiAnalyzer,
    analysisRepository,
    lessonRepository
  );
};
