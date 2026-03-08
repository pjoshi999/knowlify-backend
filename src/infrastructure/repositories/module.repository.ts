/**
 * Module Repository
 *
 * Database operations for course modules
 * Handles CRUD operations, ordering, and cascade deletes
 */

import { query } from "../database/pool.js";
import {
  Module,
  CreateModuleInput,
  UpdateModuleInput,
  ModuleWithLessons,
} from "../../domain/models/module.model.js";

interface ModuleRow {
  id: string;
  course_id: string;
  title: string;
  description?: string;
  order: number;
  created_at: Date;
  updated_at: Date;
}

const mapToModule = (row: ModuleRow): Module => ({
  id: row.id,
  courseId: row.course_id,
  title: row.title,
  description: row.description,
  order: row.order,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class ModuleRepository {
  /**
   * Create a new module
   */
  async createModule(input: CreateModuleInput): Promise<Module> {
    const result = await query<ModuleRow>(
      `INSERT INTO modules (course_id, title, description, "order")
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.courseId, input.title, input.description || null, input.order]
    );

    if (!result.rows[0]) {
      throw new Error("Failed to create module");
    }

    return mapToModule(result.rows[0]);
  }

  /**
   * Update an existing module
   */
  async updateModule(
    moduleId: string,
    updates: UpdateModuleInput
  ): Promise<Module> {
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

    if (updates.order !== undefined) {
      setClauses.push(`"order" = $${paramIndex++}`);
      values.push(updates.order);
    }

    if (setClauses.length === 0) {
      throw new Error("No fields to update");
    }

    values.push(moduleId);

    const result = await query<ModuleRow>(
      `UPDATE modules
       SET ${setClauses.join(", ")}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    if (!result.rows[0]) {
      throw new Error("Module not found");
    }

    return mapToModule(result.rows[0]);
  }

  /**
   * Delete a module (cascade deletes lessons)
   */
  async deleteModule(moduleId: string): Promise<void> {
    const result = await query("DELETE FROM modules WHERE id = $1", [moduleId]);

    if (result.rowCount === 0) {
      throw new Error("Module not found");
    }
  }

  /**
   * Reorder modules within a course
   */
  async reorderModules(
    courseId: string,
    moduleOrders: Array<{ id: string; order: number }>
  ): Promise<void> {
    // Use a transaction to ensure atomicity
    await query("BEGIN");

    try {
      for (const { id, order } of moduleOrders) {
        await query(
          `UPDATE modules
           SET "order" = $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2 AND course_id = $3`,
          [order, id, courseId]
        );
      }

      await query("COMMIT");
    } catch (error) {
      await query("ROLLBACK");
      throw error;
    }
  }

  /**
   * Get all modules for a course (without lessons)
   */
  async getModulesByCourse(courseId: string): Promise<Module[]> {
    const result = await query<ModuleRow>(
      `SELECT * FROM modules
       WHERE course_id = $1
       ORDER BY "order" ASC`,
      [courseId]
    );

    return result.rows.map(mapToModule);
  }

  /**
   * Get all modules for a course with lessons
   */
  async getModulesWithLessonsByCourse(
    courseId: string
  ): Promise<ModuleWithLessons[]> {
    const result = await query<
      ModuleRow & {
        lesson_id?: string;
        lesson_title?: string;
        lesson_description?: string;
        lesson_type?: string;
        lesson_order?: number;
        lesson_duration?: number;
        asset_url?: string;
      }
    >(
      `SELECT 
        m.*,
        l.id as lesson_id,
        l.title as lesson_title,
        l.description as lesson_description,
        l.type as lesson_type,
        l."order" as lesson_order,
        l.duration as lesson_duration,
        ca.file_url as asset_url
       FROM modules m
       LEFT JOIN lessons l ON m.id = l.module_id
       LEFT JOIN course_assets ca ON l.asset_id = ca.id
       WHERE m.course_id = $1
       ORDER BY m."order" ASC, l."order" ASC`,
      [courseId]
    );

    // Group lessons by module
    const modulesMap = new Map<string, ModuleWithLessons>();

    for (const row of result.rows) {
      if (!modulesMap.has(row.id)) {
        modulesMap.set(row.id, {
          ...mapToModule(row),
          lessons: [],
        });
      }

      const courseModule = modulesMap.get(row.id)!;

      if (row.lesson_id) {
        courseModule.lessons.push({
          id: row.lesson_id,
          title: row.lesson_title!,
          description: row.lesson_description,
          type: row.lesson_type!,
          order: row.lesson_order!,
          duration: row.lesson_duration,
          assetUrl: row.asset_url,
        });
      }
    }

    return Array.from(modulesMap.values());
  }

  /**
   * Get a single module by ID
   */
  async getModuleById(moduleId: string): Promise<Module | null> {
    const result = await query<ModuleRow>(
      "SELECT * FROM modules WHERE id = $1",
      [moduleId]
    );

    return result.rows[0] ? mapToModule(result.rows[0]) : null;
  }

  /**
   * Check if a module belongs to a specific course
   */
  async isModuleInCourse(moduleId: string, courseId: string): Promise<boolean> {
    const result = await query<{ exists: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM modules WHERE id = $1 AND course_id = $2) as exists",
      [moduleId, courseId]
    );

    return result.rows[0]?.exists || false;
  }

  /**
   * Get the next available order number for a course
   */
  async getNextOrderNumber(courseId: string): Promise<number> {
    const result = await query<{ max_order: number | null }>(
      `SELECT MAX("order") as max_order FROM modules WHERE course_id = $1`,
      [courseId]
    );

    const maxOrder = result.rows[0]?.max_order;
    return maxOrder ? maxOrder + 1 : 1;
  }
}

export const createModuleRepository = (): ModuleRepository => {
  return new ModuleRepository();
};
