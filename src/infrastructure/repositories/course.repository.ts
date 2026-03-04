import {
  Course,
  CreateCourseInput,
  UpdateCourseInput,
  CourseWithStats,
  CourseListFilters,
  CoursePaginationParams,
} from "../../domain/types/course.types.js";
import { CourseRepositoryPort } from "../../application/ports/course.repository.port.js";
import { PaginationResult } from "../../domain/types/value-objects.types.js";
import { query } from "../database/pool.js";
import { generateUrlSlug } from "../../domain/logic/course.logic.js";

export const createCourseRepository = (): CourseRepositoryPort => {
  return {
    findById: async (id: string): Promise<Course | null> => {
      const result = await query<Course>(
        "SELECT * FROM courses WHERE id = $1 AND deleted_at IS NULL",
        [id]
      );
      return result.rows[0] ?? null;
    },

    findBySlug: async (slug: string): Promise<Course | null> => {
      const result = await query<Course>(
        "SELECT * FROM courses WHERE url_slug = $1 AND deleted_at IS NULL",
        [slug]
      );
      return result.rows[0] ?? null;
    },

    findByInstructor: async (instructorId: string): Promise<Course[]> => {
      const result = await query<Course>(
        "SELECT * FROM courses WHERE instructor_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC",
        [instructorId]
      );
      return result.rows;
    },

    findAll: async (
      filters: CourseListFilters,
      pagination: CoursePaginationParams
    ): Promise<PaginationResult<CourseWithStats>> => {
      const conditions: string[] = ["c.deleted_at IS NULL"];
      const params: unknown[] = [];
      let paramIndex = 1;

      if (filters.category) {
        conditions.push(`c.category = $${paramIndex++}`);
        params.push(filters.category);
      }

      if (filters.minPrice !== undefined) {
        conditions.push(`c.price_amount >= $${paramIndex++}`);
        params.push(filters.minPrice);
      }

      if (filters.maxPrice !== undefined) {
        conditions.push(`c.price_amount <= $${paramIndex++}`);
        params.push(filters.maxPrice);
      }

      if (filters.status) {
        conditions.push(`c.status = $${paramIndex++}`);
        params.push(filters.status);
      }

      if (filters.instructorId) {
        conditions.push(`c.instructor_id = $${paramIndex++}`);
        params.push(filters.instructorId);
      }

      if (filters.search) {
        conditions.push(
          `(c.name ILIKE $${paramIndex} OR c.description ILIKE $${paramIndex})`
        );
        params.push(`%${filters.search}%`);
        paramIndex++;
      }

      if (filters.minRating !== undefined) {
        conditions.push(`COALESCE(cs.avg_rating, 0) >= $${paramIndex++}`);
        params.push(filters.minRating);
      }

      const whereClause = conditions.join(" AND ");

      // Map sort fields
      const sortFieldMap: Record<string, string> = {
        createdAt: "c.created_at",
        priceAmount: "c.price_amount",
        enrollmentCount: "cs.enrollment_count",
        avgRating: "cs.avg_rating",
      };

      const sortField = sortFieldMap[pagination.sortBy || "createdAt"];
      const sortOrder = pagination.sortOrder || "desc";

      const offset = (pagination.page - 1) * pagination.limit;

      // Get total count
      const countResult = await query<{ count: string }>(
        `SELECT COUNT(*) as count
         FROM courses c
         LEFT JOIN course_stats cs ON c.id = cs.course_id
         WHERE ${whereClause}`,
        params
      );

      const totalCount = parseInt(countResult.rows[0]?.count || "0", 10);

      // Get paginated results
      const result = await query<CourseWithStats>(
        `SELECT 
           c.*,
           COALESCE(cs.enrollment_count, 0) as enrollment_count,
           COALESCE(cs.avg_rating, 0) as avg_rating,
           COALESCE(cs.review_count, 0) as review_count,
           COALESCE(cs.total_revenue, 0) as total_revenue
         FROM courses c
         LEFT JOIN course_stats cs ON c.id = cs.course_id
         WHERE ${whereClause}
         ORDER BY ${sortField} ${sortOrder}
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, pagination.limit, offset]
      );

      return {
        data: result.rows,
        pagination: {
          page: pagination.page,
          limit: pagination.limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / pagination.limit),
          hasNext: pagination.page < Math.ceil(totalCount / pagination.limit),
          hasPrev: pagination.page > 1,
        },
      };
    },

    create: async (input: CreateCourseInput): Promise<Course> => {
      const urlSlug = generateUrlSlug(input.name);

      const result = await query<Course>(
        `INSERT INTO courses (
           instructor_id, name, description, category, thumbnail_url,
           price_amount, price_currency, manifest, url_slug, status
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'DRAFT')
         RETURNING *`,
        [
          input.instructorId,
          input.name,
          input.description,
          input.category,
          input.thumbnailUrl || null,
          input.priceAmount,
          input.priceCurrency || "USD",
          JSON.stringify(input.manifest || { modules: [] }),
          urlSlug,
        ]
      );

      return result.rows[0]!;
    },

    update: async (id: string, input: UpdateCourseInput): Promise<Course> => {
      const fields: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      if (input.name !== undefined) {
        fields.push(`name = $${paramIndex++}`);
        values.push(input.name);
      }

      if (input.description !== undefined) {
        fields.push(`description = $${paramIndex++}`);
        values.push(input.description);
      }

      if (input.category !== undefined) {
        fields.push(`category = $${paramIndex++}`);
        values.push(input.category);
      }

      if (input.thumbnailUrl !== undefined) {
        fields.push(`thumbnail_url = $${paramIndex++}`);
        values.push(input.thumbnailUrl);
      }

      if (input.priceAmount !== undefined) {
        fields.push(`price_amount = $${paramIndex++}`);
        values.push(input.priceAmount);
      }

      if (input.manifest !== undefined) {
        fields.push(`manifest = $${paramIndex++}`);
        values.push(JSON.stringify(input.manifest));
      }

      fields.push(`updated_at = NOW()`);
      values.push(id);

      const result = await query<Course>(
        `UPDATE courses SET ${fields.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
        values
      );

      return result.rows[0]!;
    },

    delete: async (id: string): Promise<void> => {
      await query("UPDATE courses SET deleted_at = NOW() WHERE id = $1", [id]);
    },

    publish: async (id: string): Promise<Course> => {
      const result = await query<Course>(
        `UPDATE courses 
         SET status = 'PUBLISHED', published_at = NOW(), updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id]
      );
      return result.rows[0]!;
    },

    archive: async (id: string): Promise<Course> => {
      const result = await query<Course>(
        `UPDATE courses 
         SET status = 'ARCHIVED', updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id]
      );
      return result.rows[0]!;
    },

    exists: async (id: string): Promise<boolean> => {
      const result = await query<{ exists: boolean }>(
        "SELECT EXISTS(SELECT 1 FROM courses WHERE id = $1 AND deleted_at IS NULL)",
        [id]
      );
      return result.rows[0]?.exists ?? false;
    },

    getStats: async (id: string): Promise<CourseWithStats | null> => {
      const result = await query<CourseWithStats>(
        `SELECT 
           c.*,
           COALESCE(cs.enrollment_count, 0) as enrollment_count,
           COALESCE(cs.avg_rating, 0) as avg_rating,
           COALESCE(cs.review_count, 0) as review_count,
           COALESCE(cs.total_revenue, 0) as total_revenue
         FROM courses c
         LEFT JOIN course_stats cs ON c.id = cs.course_id
         WHERE c.id = $1 AND c.deleted_at IS NULL`,
        [id]
      );
      return result.rows[0] ?? null;
    },
  };
};
