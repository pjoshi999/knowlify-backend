import {
  User,
  CreateUserInput,
  UpdateUserInput,
} from "../../domain/types/user.types.js";
import { UserRepositoryPort } from "../../application/ports/user.repository.port.js";
import { query } from "../database/pool.js";

export const createUserRepository = (): UserRepositoryPort => {
  return {
    findById: async (id: string): Promise<User | null> => {
      const result = await query<User>(
        "SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL",
        [id]
      );
      return result.rows[0] ?? null;
    },

    findByEmail: async (email: string): Promise<User | null> => {
      const result = await query<User>(
        "SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL",
        [email]
      );
      return result.rows[0] ?? null;
    },

    create: async (
      input: CreateUserInput & { hashedPassword: string }
    ): Promise<User> => {
      const result = await query<User>(
        `INSERT INTO users (email, role, name, password)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [input.email, input.role, input.name, input.hashedPassword]
      );
      return result.rows[0]!;
    },

    update: async (id: string, input: UpdateUserInput): Promise<User> => {
      const fields: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      if (input.name !== undefined) {
        fields.push(`name = $${paramIndex++}`);
        values.push(input.name);
      }

      if (input.avatarUrl !== undefined) {
        fields.push(`avatar_url = $${paramIndex++}`);
        values.push(input.avatarUrl);
      }

      if (input.bio !== undefined) {
        fields.push(`bio = $${paramIndex++}`);
        values.push(input.bio);
      }

      fields.push(`updated_at = NOW()`);
      values.push(id);

      const result = await query<User>(
        `UPDATE users SET ${fields.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
        values
      );

      return result.rows[0]!;
    },

    delete: async (id: string): Promise<void> => {
      await query("UPDATE users SET deleted_at = NOW() WHERE id = $1", [id]);
    },

    exists: async (email: string): Promise<boolean> => {
      const result = await query<{ exists: boolean }>(
        "SELECT EXISTS(SELECT 1 FROM users WHERE email = $1 AND deleted_at IS NULL)",
        [email]
      );
      return result.rows[0]?.exists ?? false;
    },
  };
};
