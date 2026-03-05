import type { ChatRepository } from "../../ports/chat.repository.port.js";
import type {
  ChatSession,
  ChatMessage,
} from "../../../domain/types/chat.types.js";
import { NotFoundError } from "../../../domain/errors/domain.errors.js";

export interface GetChatSessionInput {
  sessionId: string;
  userId: string;
}

export interface ChatSessionWithMessages {
  session: ChatSession;
  messages: ChatMessage[];
}

export const getChatSessionUseCase = (deps: {
  chatRepository: ChatRepository;
}) => {
  return async (
    input: GetChatSessionInput
  ): Promise<ChatSessionWithMessages> => {
    const session = await deps.chatRepository.getSessionById(input.sessionId);

    if (!session) {
      throw new NotFoundError("Chat session not found");
    }

    if (session.userId !== input.userId) {
      throw new NotFoundError("Chat session not found");
    }

    const messages = await deps.chatRepository.getSessionMessages(
      input.sessionId
    );

    return {
      session,
      messages,
    };
  };
};
