export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionInput {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface ChatCompletionResult {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface ExtractMetadataInput {
  conversationHistory: ChatMessage[];
  extractionPrompt: string;
}

export interface CourseMetadataExtraction {
  courseName: string;
  description: string;
  category?: string;
  level?: string;
  language?: string;
  tags?: string[];
}

export interface AIPort {
  chatCompletion: (input: ChatCompletionInput) => Promise<ChatCompletionResult>;
  streamChatCompletion: (input: ChatCompletionInput) => AsyncIterable<string>;
  extractCourseMetadata: (
    input: ExtractMetadataInput
  ) => Promise<CourseMetadataExtraction>;
}
