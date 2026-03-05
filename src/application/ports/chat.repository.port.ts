import type {
  ChatSession,
  ChatMessage,
  CreateChatSessionInput,
  CreateChatMessageInput,
  UpdateChatSessionInput,
} from "../../domain/types/chat.types.js";

export interface ChatRepository {
  createSession: (input: CreateChatSessionInput) => Promise<ChatSession>;
  getSessionById: (sessionId: string) => Promise<ChatSession | null>;
  getUserSessions: (userId: string) => Promise<ChatSession[]>;
  updateSession: (
    sessionId: string,
    input: UpdateChatSessionInput
  ) => Promise<ChatSession>;
  deleteSession: (sessionId: string) => Promise<void>;

  createMessage: (input: CreateChatMessageInput) => Promise<ChatMessage>;
  getSessionMessages: (sessionId: string) => Promise<ChatMessage[]>;
  deleteSessionMessages: (sessionId: string) => Promise<void>;
}
