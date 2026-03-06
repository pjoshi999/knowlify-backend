import {
  Course,
  CourseAsset,
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

interface CourseRow {
  id: string;
  instructor_id: string;
  instructor_name?: string;
  name: string;
  description: string;
  category: string;
  thumbnail_url?: string;
  status: Course["status"];
  price_amount: number;
  price_currency: string;
  manifest: Course["manifest"];
  url_slug: string;
  created_at: Date;
  updated_at: Date;
  published_at?: Date;
  deleted_at?: Date;
  enrollment_count?: number | string;
  avg_rating?: number | string;
  review_count?: number | string;
  total_revenue?: number | string;
}

const mapToCourse = (row: CourseRow): Course => ({
  id: row["id"],
  instructorId: row["instructor_id"],
  instructorName: row["instructor_name"],
  name: row["name"],
  description: row["description"],
  category: row["category"],
  thumbnailUrl: row["thumbnail_url"],
  status: row["status"],
  priceAmount: Number(row["price_amount"]),
  priceCurrency: row["price_currency"],
  manifest: row["manifest"],
  urlSlug: row["url_slug"],
  createdAt: row["created_at"],
  updatedAt: row["updated_at"],
  publishedAt: row["published_at"],
  deletedAt: row["deleted_at"],
});

const mapToCourseWithStats = (row: CourseRow): CourseWithStats => ({
  ...mapToCourse(row),
  enrollmentCount: Number(row["enrollment_count"] ?? 0),
  avgRating: Number(row["avg_rating"] ?? 0),
  reviewCount: Number(row["review_count"] ?? 0),
  totalRevenue: Number(row["total_revenue"] ?? 0),
});

export const createCourseRepository = (): CourseRepositoryPort => {
  return {
    findById: async (id: string): Promise<Course | null> => {
      const result = await query<CourseRow>(
        `SELECT c.*, u.name as instructor_name
         FROM courses c
         LEFT JOIN users u ON c.instructor_id = u.id
         WHERE c.id = $1 AND c.deleted_at IS NULL`,
        [id]
      );
      return result.rows[0] ? mapToCourse(result.rows[0]) : null;
    },

    findBySlug: async (slug: string): Promise<Course | null> => {
      const result = await query<CourseRow>(
        "SELECT * FROM courses WHERE url_slug = $1 AND deleted_at IS NULL",
        [slug]
      );
      return result.rows[0] ? mapToCourse(result.rows[0]) : null;
    },

    findByInstructor: async (instructorId: string): Promise<Course[]> => {
      const result = await query<CourseRow>(
        "SELECT * FROM courses WHERE instructor_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC",
        [instructorId]
      );
      return result.rows.map(mapToCourse);
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

      const sortField =
        sortFieldMap[pagination.sortBy ?? "createdAt"] ?? "c.created_at";
      const sortOrder = pagination.sortOrder === "asc" ? "asc" : "desc";

      const offset = (pagination.page - 1) * pagination.limit;

      // Get total count
      const countResult = await query<{ count: string }>(
        `SELECT COUNT(*) as count
         FROM courses c
         LEFT JOIN course_statistics cs ON c.id = cs.course_id
         WHERE ${whereClause}`,
        params
      );

      const totalCount = parseInt(countResult.rows[0]?.count ?? "0", 10);

      // Get paginated results
      const result = await query<CourseRow>(
        `SELECT 
           c.*,
           u.name as instructor_name,
           COALESCE(cs.enrollment_count, 0) as enrollment_count,
           COALESCE(cs.avg_rating, 0) as avg_rating,
           COALESCE(cs.review_count, 0) as review_count,
           COALESCE(cs.total_revenue, 0) as total_revenue
         FROM courses c
         LEFT JOIN users u ON c.instructor_id = u.id
         LEFT JOIN course_statistics cs ON c.id = cs.course_id
         WHERE ${whereClause}
         ORDER BY ${sortField} ${sortOrder}
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, pagination.limit, offset]
      );

      return {
        data: result.rows.map(mapToCourseWithStats),
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

      const result = await query<CourseRow>(
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
          input.thumbnailUrl ?? null,
          input.priceAmount,
          input.priceCurrency ?? "USD",
          JSON.stringify(input.manifest ?? { modules: [] }),
          urlSlug,
        ]
      );

      return mapToCourse(result.rows[0]!);
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

      const result = await query<CourseRow>(
        `UPDATE courses SET ${fields.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
        values
      );

      return mapToCourse(result.rows[0]!);
    },

    delete: async (id: string): Promise<void> => {
      await query("UPDATE courses SET deleted_at = NOW() WHERE id = $1", [id]);
    },

    publish: async (id: string): Promise<Course> => {
      const result = await query<CourseRow>(
        `UPDATE courses 
         SET status = 'PUBLISHED', published_at = NOW(), updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id]
      );
      return mapToCourse(result.rows[0]!);
    },

    archive: async (id: string): Promise<Course> => {
      const result = await query<CourseRow>(
        `UPDATE courses 
         SET status = 'ARCHIVED', updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id]
      );
      return mapToCourse(result.rows[0]!);
    },

    exists: async (id: string): Promise<boolean> => {
      const result = await query<{ exists: boolean }>(
        "SELECT EXISTS(SELECT 1 FROM courses WHERE id = $1 AND deleted_at IS NULL)",
        [id]
      );
      return result.rows[0]?.exists ?? false;
    },

    getStats: async (id: string): Promise<CourseWithStats | null> => {
      const result = await query<CourseRow>(
        `SELECT 
           c.*,
           u.name as instructor_name,
           COALESCE(cs.enrollment_count, 0) as enrollment_count,
           COALESCE(cs.avg_rating, 0) as avg_rating,
           COALESCE(cs.review_count, 0) as review_count,
           COALESCE(cs.total_revenue, 0) as total_revenue
         FROM courses c
         LEFT JOIN users u ON c.instructor_id = u.id
         LEFT JOIN course_statistics cs ON c.id = cs.course_id
         WHERE c.id = $1 AND c.deleted_at IS NULL`,
        [id]
      );
      return result.rows[0] ? mapToCourseWithStats(result.rows[0]) : null;
    },

    findAssets: async (courseId: string): Promise<CourseAsset[]> => {
      interface AssetRow {
        id: string;
        course_id: string;
        asset_type: CourseAsset["assetType"];
        file_name: string;
        file_size: number;
        storage_path: string;
        mime_type: string;
        duration?: number;
        metadata?: Record<string, unknown>;
        created_at: Date;
      }

      const result = await query<AssetRow>(
        `SELECT id, course_id, asset_type, file_name, file_size,
                storage_path, mime_type, duration, metadata, created_at
         FROM course_assets
         WHERE course_id = $1
         ORDER BY created_at DESC`,
        [courseId]
      );

      return result.rows.map((row) => ({
        id: row["id"],
        courseId: row["course_id"],
        assetType: row["asset_type"],
        fileName: row["file_name"],
        fileSize: Number(row["file_size"]),
        storagePath: row["storage_path"],
        mimeType: row["mime_type"],
        duration: row["duration"],
        metadata: row["metadata"],
        createdAt: row["created_at"],
      }));
    },

    createAsset: async (
      input: import("../../application/ports/course.repository.port.js").CreateCourseAssetInput
    ): Promise<CourseAsset> => {
      interface AssetRow {
        id: string;
        course_id: string;
        asset_type: CourseAsset["assetType"];
        file_name: string;
        file_size: number;
        storage_path: string;
        mime_type: string;
        duration?: number;
        metadata?: Record<string, unknown>;
        created_at: Date;
      }

      const result = await query<AssetRow>(
        `INSERT INTO course_assets (
           course_id, asset_type, file_name, file_size,
           storage_path, mime_type, duration, metadata
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          input.courseId,
          input.assetType,
          input.fileName,
          input.fileSize,
          input.storagePath,
          input.mimeType,
          input.duration ?? null,
          input.metadata ? JSON.stringify(input.metadata) : null,
        ]
      );

      const row = result.rows[0]!;
      return {
        id: row["id"],
        courseId: row["course_id"],
        assetType: row["asset_type"],
        fileName: row["file_name"],
        fileSize: Number(row["file_size"]),
        storagePath: row["storage_path"],
        mimeType: row["mime_type"],
        duration: row["duration"],
        metadata: row["metadata"],
        createdAt: row["created_at"],
      };
    },
  };
};
