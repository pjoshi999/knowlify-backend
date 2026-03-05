import type { ChatRepository } from "../../ports/chat.repository.port.js";
import type { ChatSession } from "../../../domain/types/chat.types.js";

export interface CreateChatSessionInput {
  userId: string;
}

export const createChatSessionUseCase = (deps: {
  chatRepository: ChatRepository;
}) => {
  return async (input: CreateChatSessionInput): Promise<ChatSession> => {
    const session = await deps.chatRepository.createSession({
      userId: input.userId,
      metadata: {
        startedAt: new Date().toISOString(),
      },
    });

    // Create initial system message
    await deps.chatRepository.createMessage({
      sessionId: session.id,
      role: "system",
      content:
        "Welcome! I will help you upload your course. Please start by uploading your course folder as a ZIP file, or tell me about your course.",
    });

    return session;
  };
};
