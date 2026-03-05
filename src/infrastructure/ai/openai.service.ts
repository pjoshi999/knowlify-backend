import OpenAI from "openai";
import type {
  AIPort,
  ChatCompletionInput,
  ChatCompletionResult,
  ExtractMetadataInput,
  CourseMetadataExtraction,
} from "../../application/ports/ai.port.js";
import { createModuleLogger } from "../../shared/logger.js";

const log = createModuleLogger("openai");

export const createOpenAIService = (apiKey: string): AIPort => {
  const client = new OpenAI({ apiKey });

  const chatCompletion = async (
    input: ChatCompletionInput
  ): Promise<ChatCompletionResult> => {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: input.messages,
      temperature: input.temperature ?? 0.7,
      max_tokens: input.maxTokens ?? 1000,
      stream: false,
    });

    const choice = response.choices[0];
    if (!choice?.message.content) {
      throw new Error("No response from OpenAI");
    }

    return {
      content: choice.message.content,
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : undefined,
    };
  };

  const streamChatCompletion = async function* (
    input: ChatCompletionInput
  ): AsyncIterable<string> {
    const stream = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: input.messages,
      temperature: input.temperature ?? 0.7,
      max_tokens: input.maxTokens ?? 1000,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  };

  const extractCourseMetadata = async (
    input: ExtractMetadataInput
  ): Promise<CourseMetadataExtraction> => {
    const messages = [
      ...input.conversationHistory,
      {
        role: "system" as const,
        content: input.extractionPrompt,
      },
    ];

    const response = await chatCompletion({ messages, temperature: 0.3 });

    try {
      const metadata = JSON.parse(
        response.content
      ) as Partial<CourseMetadataExtraction>;
      return {
        courseName: metadata.courseName ?? "Untitled Course",
        description: metadata.description ?? "",
        category: metadata.category,
        level: metadata.level,
        language: metadata.language ?? "en",
        tags: metadata.tags ?? [],
      };
    } catch (error) {
      log.error({ err: error }, "Failed to parse metadata");
      return {
        courseName: "Untitled Course",
        description: "",
        language: "en",
      };
    }
  };

  return {
    chatCompletion,
    streamChatCompletion,
    extractCourseMetadata,
  };
};
