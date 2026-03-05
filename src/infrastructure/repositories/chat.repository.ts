import type { Pool } from "pg";
import type { ChatRepository } from "../../application/ports/chat.repository.port.js";
import type {
  ChatSession,
  ChatMessage,
  CreateChatSessionInput,
  CreateChatMessageInput,
  UpdateChatSessionInput,
} from "../../domain/types/chat.types.js";

export const createChatRepository = (pool: Pool): ChatRepository => {
  const createSession = async (
    input: CreateChatSessionInput
  ): Promise<ChatSession> => {
    const query = `
      INSERT INTO chat_sessions (user_id, metadata)
      VALUES ($1, $2)
      RETURNING id, user_id, status, course_id, metadata, created_at, updated_at
    `;

    const result = await pool.query(query, [
      input.userId,
      JSON.stringify(input.metadata || {}),
    ]);

    const row = result.rows[0];
    return {
      id: row.id,
      userId: row.user_id,
      status: row.status,
      courseId: row.course_id,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  };

  const getSessionById = async (
    sessionId: string
  ): Promise<ChatSession | null> => {
    const query = `
      SELECT id, user_id, status, course_id, metadata, created_at, updated_at
      FROM chat_sessions
      WHERE id = $1
    `;

    const result = await pool.query(query, [sessionId]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      userId: row.user_id,
      status: row.status,
      courseId: row.course_id,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  };

  const getUserSessions = async (userId: string): Promise<ChatSession[]> => {
    const query = `
      SELECT id, user_id, status, course_id, metadata, created_at, updated_at
      FROM chat_sessions
      WHERE user_id = $1
      ORDER BY created_at DESC
    `;

    const result = await pool.query(query, [userId]);

    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      status: row.status,
      courseId: row.course_id,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  };

  const updateSession = async (
    sessionId: string,
    input: UpdateChatSessionInput
  ): Promise<ChatSession> => {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    if (input.status !== undefined) {
      updates.push(`status = $${paramCount++}`);
      values.push(input.status);
    }

    if (input.courseId !== undefined) {
      updates.push(`course_id = $${paramCount++}`);
      values.push(input.courseId);
    }

    if (input.metadata !== undefined) {
      updates.push(`metadata = $${paramCount++}`);
      values.push(JSON.stringify(input.metadata));
    }

    if (updates.length === 0) {
      const session = await getSessionById(sessionId);
      if (!session) {
        throw new Error("Session not found");
      }
      return session;
    }

    values.push(sessionId);

    const query = `
      UPDATE chat_sessions
      SET ${updates.join(", ")}
      WHERE id = $${paramCount}
      RETURNING id, user_id, status, course_id, metadata, created_at, updated_at
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      throw new Error("Session not found");
    }

    const row = result.rows[0];
    return {
      id: row.id,
      userId: row.user_id,
      status: row.status,
      courseId: row.course_id,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  };

  const deleteSession = async (sessionId: string): Promise<void> => {
    const query = "DELETE FROM chat_sessions WHERE id = $1";
    await pool.query(query, [sessionId]);
  };

  const createMessage = async (
    input: CreateChatMessageInput
  ): Promise<ChatMessage> => {
    const query = `
      INSERT INTO chat_messages (session_id, role, content, metadata)
      VALUES ($1, $2, $3, $4)
      RETURNING id, session_id, role, content, metadata, created_at
    `;

    const result = await pool.query(query, [
      input.sessionId,
      input.role,
      input.content,
      JSON.stringify(input.metadata || {}),
    ]);

    const row = result.rows[0];
    return {
      id: row.id,
      sessionId: row.session_id,
      role: row.role,
      content: row.content,
      metadata: row.metadata,
      createdAt: row.created_at,
    };
  };

  const getSessionMessages = async (
    sessionId: string
  ): Promise<ChatMessage[]> => {
    const query = `
      SELECT id, session_id, role, content, metadata, created_at
      FROM chat_messages
      WHERE session_id = $1
      ORDER BY created_at ASC
    `;

    const result = await pool.query(query, [sessionId]);

    return result.rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      role: row.role,
      content: row.content,
      metadata: row.metadata,
      createdAt: row.created_at,
    }));
  };

  const deleteSessionMessages = async (sessionId: string): Promise<void> => {
    const query = "DELETE FROM chat_messages WHERE session_id = $1";
    await pool.query(query, [sessionId]);
  };

  return {
    createSession,
    getSessionById,
    getUserSessions,
    updateSession,
    deleteSession,
    createMessage,
    getSessionMessages,
    deleteSessionMessages,
  };
};
