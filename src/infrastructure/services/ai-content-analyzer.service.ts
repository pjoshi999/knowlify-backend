/**
 * AI Content Analyzer Service
 *
 * Analyzes course content using OpenAI API
 * - Folder structure analysis
 * - Video content analysis with Whisper transcription
 * - PDF content analysis
 */

import OpenAI from "openai";
import { SuggestedStructure } from "../../domain/models/upload-session-v2.model.js";
import { createModuleLogger } from "../../shared/logger.js";

const log = createModuleLogger("ai-content-analyzer");

export interface VideoMetadata {
  title: string;
  hasAudio: boolean;
  duration?: number;
}

export interface VideoAnalysis {
  summary: string;
  topics: string[];
  learningObjectives: string[];
  keyPoints: string[];
  difficulty: "beginner" | "intermediate" | "advanced";
  transcription?: string;
  analyzedAt: Date;
}

export interface PDFAnalysis {
  summary: string;
  topics: string[];
  learningObjectives: string[];
  keyPoints: string[];
  difficulty: "beginner" | "intermediate" | "advanced";
  analyzedAt: Date;
}

export interface FileMetadata {
  name: string;
  path: string;
  type: string;
  size: number;
}

export class AIContentAnalyzer {
  private client: OpenAI;
  private retryAttempts = 3;
  private retryDelay = 1000; // 1 second

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  /**
   * Analyze folder structure and suggest course organization
   */
  async analyzeStructure(files: FileMetadata[]): Promise<SuggestedStructure> {
    log.info({ fileCount: files.length }, "Analyzing folder structure");

    // Step 1: Detect module patterns
    const detectedModules = this.detectModulePatterns(files);

    // Step 2: Use AI to refine structure
    const fileList = files.map((f) => f.path).join("\n");
    const detectedPatterns = Array.from(detectedModules.keys()).join(", ");

    const prompt = `Analyze this course folder structure and organize it into logical modules.

Files:
${fileList}

Detected patterns: ${detectedPatterns}

Create a well-organized course structure with:
- 3-8 modules (logical groupings)
- Clear, descriptive module titles
- Lessons ordered logically within each module
- Suggested course name, description, and category

Return JSON with structure: { modules: [...], metadata: {...} }

Each module should have: title, description, order, lessons[]
Each lesson should have: title, type, fileName, order`;

    try {
      const response = await this.callGPT4WithRetry(prompt, 0.5);
      const suggestedStructure = JSON.parse(response) as SuggestedStructure;

      log.info(
        { moduleCount: suggestedStructure.modules.length },
        "Structure analysis complete"
      );

      return suggestedStructure;
    } catch (error) {
      log.error({ error }, "Failed to analyze structure");
      throw new Error("Failed to analyze folder structure");
    }
  }

  /**
   * Analyze video content with transcription
   */
  async analyzeVideoContent(
    videoUrl: string,
    metadata: VideoMetadata
  ): Promise<VideoAnalysis> {
    log.info({ title: metadata.title }, "Analyzing video content");

    let transcription: string | undefined;

    // Step 1: Generate transcription if audio present
    if (metadata.hasAudio) {
      try {
        transcription = await this.transcribeVideo(videoUrl);
        log.debug(
          { title: metadata.title, transcriptionLength: transcription.length },
          "Transcription complete"
        );
      } catch (error) {
        log.warn({ error }, "Transcription failed, continuing without it");
      }
    }

    // Step 2: Analyze content with GPT-4
    const prompt = `Analyze this educational video content and provide:
1. A concise summary (2-3 sentences)
2. Key topics covered (3-5 topics)
3. Learning objectives (3-5 objectives)
4. Key points students should remember (5-7 points)
5. Difficulty level (beginner/intermediate/advanced)

Video title: ${metadata.title}
Duration: ${metadata.duration || "unknown"} minutes
${transcription ? `Transcription: ${transcription.substring(0, 2000)}...` : "No audio transcription available"}

Return as JSON with keys: summary, topics, learningObjectives, keyPoints, difficulty`;

    try {
      const response = await this.callGPT4WithRetry(prompt, 0.3);
      const analysis = JSON.parse(response);

      log.info({ title: metadata.title }, "Video analysis complete");

      return {
        summary: analysis.summary,
        topics: analysis.topics,
        learningObjectives: analysis.learningObjectives,
        keyPoints: analysis.keyPoints,
        difficulty: analysis.difficulty,
        transcription,
        analyzedAt: new Date(),
      };
    } catch (error) {
      log.error({ error }, "Failed to analyze video");
      throw new Error("Failed to analyze video content");
    }
  }

  /**
   * Analyze PDF content
   */
  async analyzePDFContent(pdfUrl: string): Promise<PDFAnalysis> {
    log.info({ pdfUrl }, "Analyzing PDF content");

    // In production, extract text from PDF first
    // For now, this is a placeholder
    const prompt = `Analyze this educational PDF document and provide:
1. A concise summary (2-3 sentences)
2. Key topics covered (3-5 topics)
3. Learning objectives (3-5 objectives)
4. Key points students should remember (5-7 points)
5. Difficulty level (beginner/intermediate/advanced)

Return as JSON with keys: summary, topics, learningObjectives, keyPoints, difficulty`;

    try {
      const response = await this.callGPT4WithRetry(prompt, 0.3);
      const analysis = JSON.parse(response);

      log.info({ pdfUrl }, "PDF analysis complete");

      return {
        summary: analysis.summary,
        topics: analysis.topics,
        learningObjectives: analysis.learningObjectives,
        keyPoints: analysis.keyPoints,
        difficulty: analysis.difficulty,
        analyzedAt: new Date(),
      };
    } catch (error) {
      log.error({ error }, "Failed to analyze PDF");
      throw new Error("Failed to analyze PDF content");
    }
  }

  /**
   * Transcribe video using Whisper API
   */
  private async transcribeVideo(videoUrl: string): Promise<string> {
    // In production, download video segment and send to Whisper
    // For now, this is a placeholder
    log.debug({ videoUrl }, "Transcribing video");

    // Placeholder - actual implementation would:
    // 1. Download video segment
    // 2. Extract audio
    // 3. Send to Whisper API
    // 4. Return transcription

    return "Transcription placeholder";
  }

  /**
   * Detect module patterns in file paths
   */
  private detectModulePatterns(
    files: FileMetadata[]
  ): Map<string, FileMetadata[]> {
    const modulePatterns = [
      /module[_\s-]?(\d+)/i,
      /week[_\s-]?(\d+)/i,
      /section[_\s-]?(\d+)/i,
      /chapter[_\s-]?(\d+)/i,
      /lesson[_\s-]?(\d+)/i,
    ];

    const detectedModules = new Map<string, FileMetadata[]>();

    for (const file of files) {
      let moduleKey = "uncategorized";

      // Check path for module patterns
      for (const pattern of modulePatterns) {
        const match = file.path.match(pattern);
        if (match) {
          moduleKey = match[0];
          break;
        }
      }

      if (!detectedModules.has(moduleKey)) {
        detectedModules.set(moduleKey, []);
      }
      detectedModules.get(moduleKey)!.push(file);
    }

    return detectedModules;
  }

  /**
   * Call GPT-4 with retry logic
   */
  private async callGPT4WithRetry(
    prompt: string,
    temperature: number
  ): Promise<string> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const response = await this.client.chat.completions.create({
          model: "gpt-4-turbo-preview",
          messages: [
            {
              role: "system",
              content:
                "You are an educational content analyzer. Analyze content and extract learning insights. Always return valid JSON.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          response_format: { type: "json_object" },
          temperature,
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new Error("No response from OpenAI");
        }

        return content;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this.retryAttempts) {
          const delay = this.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
          log.warn({ attempt, delay }, "Retrying OpenAI call");
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }
}

export const createAIContentAnalyzer = (apiKey: string): AIContentAnalyzer => {
  return new AIContentAnalyzer(apiKey);
};
