export interface ChatSession {
  id: string;
  userId: string;
  status: "active" | "completed" | "failed";
  courseId?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface CreateChatSessionInput {
  userId: string;
  metadata?: Record<string, unknown>;
}

export interface CreateChatMessageInput {
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateChatSessionInput {
  status?: "active" | "completed" | "failed";
  courseId?: string;
  metadata?: Record<string, unknown>;
}
