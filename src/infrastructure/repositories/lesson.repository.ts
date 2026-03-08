/**
 * Lesson Repository
 *
 * Database operations for lessons
 * Handles CRUD operations, ordering, and AI analysis integration
 */

import { query } from "../database/pool.js";
import {
  Lesson,
  CreateLessonInput,
  UpdateLessonInput,
  LessonWithAnalysis,
  AssetType,
} from "../../domain/models/lesson.model.js";

interface LessonRow {
  id: string;
  module_id: string;
  title: string;
  description?: string;
  type: AssetType;
  order: number;
  asset_id?: string;
  duration?: number;
  created_at: Date;
  updated_at: Date;
}

const mapToLesson = (row: LessonRow): Lesson => ({
  id: row.id,
  moduleId: row.module_id,
  title: row.title,
  description: row.description,
  type: row.type,
  order: row.order,
  assetId: row.asset_id,
  duration: row.duration,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class LessonRepository {
  /**
   * Create a new lesson
   */
  async createLesson(input: CreateLessonInput): Promise<Lesson> {
    const result = await query<LessonRow>(
      `INSERT INTO lessons (module_id, title, description, type, "order", asset_id, duration)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        input.moduleId,
        input.title,
        input.description || null,
        input.type,
        input.order,
        input.assetId || null,
        input.duration || null,
      ]
    );

    if (!result.rows[0]) {
      throw new Error("Failed to create lesson");
    }

    return mapToLesson(result.rows[0]);
  }

  /**
   * Update an existing lesson
   */
  async updateLesson(
    lessonId: string,
    updates: UpdateLessonInput
  ): Promise<Lesson> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.title !== undefined) {
      setClauses.push(`title = $${paramIndex++}`);
      values.push(updates.title);
    }

    if (updates.description !== undefined) {
      setClauses.push(`description = $${paramIndex++}`);
      values.push(updates.description);
    }

    if (updates.type !== undefined) {
      setClauses.push(`type = $${paramIndex++}`);
      values.push(updates.type);
    }

    if (updates.order !== undefined) {
      setClauses.push(`"order" = $${paramIndex++}`);
      values.push(updates.order);
    }

    if (updates.assetId !== undefined) {
      setClauses.push(`asset_id = $${paramIndex++}`);
      values.push(updates.assetId);
    }

    if (updates.duration !== undefined) {
      setClauses.push(`duration = $${paramIndex++}`);
      values.push(updates.duration);
    }

    if (setClauses.length === 0) {
      throw new Error("No fields to update");
    }

    values.push(lessonId);

    const result = await query<LessonRow>(
      `UPDATE lessons
       SET ${setClauses.join(", ")}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    if (!result.rows[0]) {
      throw new Error("Lesson not found");
    }

    return mapToLesson(result.rows[0]);
  }

  /**
   * Delete a lesson
   */
  async deleteLesson(lessonId: string): Promise<void> {
    const result = await query("DELETE FROM lessons WHERE id = $1", [lessonId]);

    if (result.rowCount === 0) {
      throw new Error("Lesson not found");
    }
  }

  /**
   * Reorder lessons within a module
   */
  async reorderLessons(
    moduleId: string,
    lessonOrders: Array<{ id: string; order: number }>
  ): Promise<void> {
    // Use a transaction to ensure atomicity
    await query("BEGIN");

    try {
      for (const { id, order } of lessonOrders) {
        await query(
          `UPDATE lessons
           SET "order" = $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2 AND module_id = $3`,
          [order, id, moduleId]
        );
      }

      await query("COMMIT");
    } catch (error) {
      await query("ROLLBACK");
      throw error;
    }
  }

  /**
   * Get all lessons for a module
   */
  async getLessonsByModule(moduleId: string): Promise<Lesson[]> {
    const result = await query<LessonRow>(
      `SELECT * FROM lessons
       WHERE module_id = $1
       ORDER BY "order" ASC`,
      [moduleId]
    );

    return result.rows.map(mapToLesson);
  }

  /**
   * Get lessons with AI analysis and asset URLs
   */
  async getLessonsWithAnalysisByModule(
    moduleId: string
  ): Promise<LessonWithAnalysis[]> {
    const result = await query<
      LessonRow & {
        asset_url?: string;
        analysis_summary?: string;
        analysis_topics?: string;
        analysis_objectives?: string;
        analysis_key_points?: string;
        analysis_difficulty?: "beginner" | "intermediate" | "advanced";
        analyzed_at?: Date;
      }
    >(
      `SELECT 
        l.*,
        ca.file_url as asset_url,
        la.summary as analysis_summary,
        la.topics as analysis_topics,
        la.learning_objectives as analysis_objectives,
        la.key_points as analysis_key_points,
        la.difficulty as analysis_difficulty,
        la.analyzed_at
       FROM lessons l
       LEFT JOIN course_assets ca ON l.asset_id = ca.id
       LEFT JOIN lesson_ai_analysis la ON l.id = la.lesson_id
       WHERE l.module_id = $1
       ORDER BY l."order" ASC`,
      [moduleId]
    );

    return result.rows.map((row) => {
      const lesson: LessonWithAnalysis = {
        ...mapToLesson(row),
        assetUrl: row.asset_url,
      };

      if (row.analysis_summary) {
        lesson.aiAnalysis = {
          summary: row.analysis_summary,
          topics: JSON.parse(row.analysis_topics || "[]"),
          learningObjectives: JSON.parse(row.analysis_objectives || "[]"),
          keyPoints: JSON.parse(row.analysis_key_points || "[]"),
          difficulty: row.analysis_difficulty,
          analyzedAt: row.analyzed_at!,
        };
      }

      return lesson;
    });
  }

  /**
   * Get a single lesson by ID
   */
  async getLessonById(lessonId: string): Promise<Lesson | null> {
    const result = await query<LessonRow>(
      "SELECT * FROM lessons WHERE id = $1",
      [lessonId]
    );

    return result.rows[0] ? mapToLesson(result.rows[0]) : null;
  }

  /**
   * Get a lesson with analysis by ID
   */
  async getLessonWithAnalysisById(
    lessonId: string
  ): Promise<LessonWithAnalysis | null> {
    const result = await query<
      LessonRow & {
        asset_url?: string;
        analysis_summary?: string;
        analysis_topics?: string;
        analysis_objectives?: string;
        analysis_key_points?: string;
        analysis_difficulty?: "beginner" | "intermediate" | "advanced";
        analyzed_at?: Date;
      }
    >(
      `SELECT 
        l.*,
        ca.file_url as asset_url,
        la.summary as analysis_summary,
        la.topics as analysis_topics,
        la.learning_objectives as analysis_objectives,
        la.key_points as analysis_key_points,
        la.difficulty as analysis_difficulty,
        la.analyzed_at
       FROM lessons l
       LEFT JOIN course_assets ca ON l.asset_id = ca.id
       LEFT JOIN lesson_ai_analysis la ON l.id = la.lesson_id
       WHERE l.id = $1`,
      [lessonId]
    );

    if (!result.rows[0]) {
      return null;
    }

    const row = result.rows[0];
    const lesson: LessonWithAnalysis = {
      ...mapToLesson(row),
      assetUrl: row.asset_url,
    };

    if (row.analysis_summary) {
      lesson.aiAnalysis = {
        summary: row.analysis_summary,
        topics: JSON.parse(row.analysis_topics || "[]"),
        learningObjectives: JSON.parse(row.analysis_objectives || "[]"),
        keyPoints: JSON.parse(row.analysis_key_points || "[]"),
        difficulty: row.analysis_difficulty,
        analyzedAt: row.analyzed_at!,
      };
    }

    return lesson;
  }

  /**
   * Check if a lesson belongs to a specific module
   */
  async isLessonInModule(lessonId: string, moduleId: string): Promise<boolean> {
    const result = await query<{ exists: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM lessons WHERE id = $1 AND module_id = $2) as exists",
      [lessonId, moduleId]
    );

    return result.rows[0]?.exists || false;
  }

  /**
   * Get the next available order number for a module
   */
  async getNextOrderNumber(moduleId: string): Promise<number> {
    const result = await query<{ max_order: number | null }>(
      `SELECT MAX("order") as max_order FROM lessons WHERE module_id = $1`,
      [moduleId]
    );

    const maxOrder = result.rows[0]?.max_order;
    return maxOrder ? maxOrder + 1 : 1;
  }

  /**
   * Move a lesson to a different module
   */
  async moveLessonToModule(
    lessonId: string,
    newModuleId: string,
    newOrder: number
  ): Promise<Lesson> {
    const result = await query<LessonRow>(
      `UPDATE lessons
       SET module_id = $1, "order" = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [newModuleId, newOrder, lessonId]
    );

    if (!result.rows[0]) {
      throw new Error("Lesson not found");
    }

    return mapToLesson(result.rows[0]);
  }
}

export const createLessonRepository = (): LessonRepository => {
  return new LessonRepository();
};
