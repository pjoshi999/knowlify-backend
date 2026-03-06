import OpenAI from "openai";
import { createModuleLogger } from "../../shared/logger.js";

const log = createModuleLogger("openai");

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CourseAnalysis {
  sections: Array<{
    title: string;
    order: number;
    files: string[];
    description?: string;
  }>;
  metadata: {
    suggestedName: string;
    suggestedDescription: string;
    suggestedCategory: string;
    suggestedPrice: number;
  };
}

export class OpenAIService {
  private client: OpenAI;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("OpenAI API key is required");
    }
    this.client = new OpenAI({ apiKey });
    log.info("OpenAI service initialized");
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    try {
      log.info({ messageCount: messages.length }, "Sending chat request to OpenAI");
      
      const response = await this.client.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages,
        temperature: 0.7,
        max_tokens: 2000,
      });

      const content = response.choices[0]?.message?.content || "";
      log.info({ responseLength: content.length }, "Received OpenAI response");
      
      return content;
    } catch (error) {
      log.error({ err: error }, "OpenAI chat error");
      throw error;
    }
  }

  async analyzeCourseStructure(fileList: string[]): Promise<CourseAnalysis> {
    try {
      log.info({ fileCount: fileList.length }, "Analyzing course structure");

      const prompt = `Analyze this course folder structure and organize it into logical sections.

Files in the course folder:
${fileList.slice(0, 100).join("\n")}
${fileList.length > 100 ? `\n... and ${fileList.length - 100} more files` : ""}

Instructions:
1. Group related files into logical course sections (e.g., "Introduction", "Week 1", "Module 2", etc.)
2. Determine the order of sections based on file names and structure
3. Suggest a course name, description, category, and price based on the content
4. Be intelligent about identifying videos, notes, assignments, and exams

Return ONLY a valid JSON object with this exact structure (no markdown, no extra text):
{
  "sections": [
    {
      "title": "Section name",
      "order": 1,
      "files": ["file1.pdf", "file2.mp4"],
      "description": "Brief description of what this section covers"
    }
  ],
  "metadata": {
    "suggestedName": "Course Name",
    "suggestedDescription": "Detailed course description (2-3 sentences)",
    "suggestedCategory": "Programming|Design|Business|Marketing|Photography|Music|Health & Fitness|Language|Other",
    "suggestedPrice": 49.99
  }
}`;

      const response = await this.chat([
        {
          role: "system",
          content:
            "You are a course structure analyzer. Analyze file lists and organize them into logical course sections. Always return valid JSON only, no markdown formatting.",
        },
        {
          role: "user",
          content: prompt,
        },
      ]);

      // Clean response - remove markdown code blocks if present
      let cleanedResponse = response.trim();
      if (cleanedResponse.startsWith("```json")) {
        cleanedResponse = cleanedResponse.replace(/```json\n?/g, "").replace(/```\n?/g, "");
      } else if (cleanedResponse.startsWith("```")) {
        cleanedResponse = cleanedResponse.replace(/```\n?/g, "");
      }

      const analysis = JSON.parse(cleanedResponse) as CourseAnalysis;
      
      log.info(
        {
          sectionCount: analysis.sections.length,
          suggestedName: analysis.metadata.suggestedName,
        },
        "Course structure analyzed successfully"
      );

      return analysis;
    } catch (error) {
      log.error({ err: error }, "Error analyzing course structure");
      throw new Error("Failed to analyze course structure. Please try again.");
    }
  }

  async generateConversationalResponse(
    userMessage: string,
    context: {
      hasUploadedFiles: boolean;
      fileCount?: number;
      courseName?: string;
      currentStep?: string;
    }
  ): Promise<string> {
    try {
      const systemPrompt = `You are a friendly and helpful course upload assistant for an online learning platform. 

Your role:
- Guide instructors through uploading their course materials
- Ask clarifying questions about their course
- Provide encouragement and support
- Be conversational and natural

Current context:
- Has uploaded files: ${context.hasUploadedFiles}
- File count: ${context.fileCount || 0}
- Course name: ${context.courseName || "Not set"}
- Current step: ${context.currentStep || "initial"}

Keep responses concise (2-3 sentences max) and friendly.`;

      const response = await this.chat([
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userMessage,
        },
      ]);

      return response;
    } catch (error) {
      log.error({ err: error }, "Error generating conversational response");
      return "I'm having trouble processing that right now. Could you try rephrasing your question?";
    }
  }
}

export const createOpenAIService = (apiKey: string): OpenAIService => {
  return new OpenAIService(apiKey);
};
