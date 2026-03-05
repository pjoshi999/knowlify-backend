import type { ChatRepository } from "../../ports/chat.repository.port.js";
import type { AIPort } from "../../ports/ai.port.js";
import type { ChatMessage } from "../../../domain/types/chat.types.js";
import { NotFoundError } from "../../../domain/errors/domain.errors.js";

export interface SendChatMessageInput {
  sessionId: string;
  content: string;
  userId: string;
}

export const sendChatMessageUseCase = (deps: {
  chatRepository: ChatRepository;
  aiService: AIPort;
}) => {
  return async (input: SendChatMessageInput): Promise<ChatMessage> => {
    // Verify session exists and belongs to user
    const session = await deps.chatRepository.getSessionById(input.sessionId);
    if (!session) {
      throw new NotFoundError("Chat session not found");
    }

    if (session.userId !== input.userId) {
      throw new NotFoundError("Chat session not found");
    }

    // Save user message
    await deps.chatRepository.createMessage({
      sessionId: input.sessionId,
      role: "user",
      content: input.content,
    });

    // Get conversation history
    const messages = await deps.chatRepository.getSessionMessages(
      input.sessionId
    );

    // Prepare messages for AI (exclude system messages from history)
    const aiMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    // Add system prompt
    const systemPrompt = {
      role: "system" as const,
      content: `You are a helpful course upload assistant. Your job is to:
1. Help instructors upload their course materials
2. Ask for course metadata (name, description, category, level)
3. Guide them through the upload process
4. Confirm when files are uploaded successfully

Be friendly, concise, and helpful. Ask one question at a time.`,
    };

    // Get AI response
    const aiResponse = await deps.aiService.chatCompletion({
      messages: [systemPrompt, ...aiMessages],
      temperature: 0.7,
      maxTokens: 500,
    });

    // Save assistant message
    const assistantMessage = await deps.chatRepository.createMessage({
      sessionId: input.sessionId,
      role: "assistant",
      content: aiResponse.content,
    });

    return assistantMessage;
  };
};
