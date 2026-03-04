import {
  Review,
  CreateReviewInput,
  UpdateReviewInput,
  CourseRatingStats,
} from "../../domain/types/review.types.js";
import { ReviewRepositoryPort } from "../../application/ports/review.repository.port.js";
import { query } from "../database/pool.js";

export const createReviewRepository = (): ReviewRepositoryPort => {
  return {
    findById: async (id: string): Promise<Review | null> => {
      const result = await query<Review>(
        "SELECT * FROM reviews WHERE id = $1 AND deleted_at IS NULL",
        [id]
      );
      return result.rows[0] ?? null;
    },

    findByCourse: async (courseId: string): Promise<Review[]> => {
      const result = await query<Review>(
        "SELECT * FROM reviews WHERE course_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC",
        [courseId]
      );
      return result.rows;
    },

    findByStudent: async (studentId: string): Promise<Review[]> => {
      const result = await query<Review>(
        "SELECT * FROM reviews WHERE student_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC",
        [studentId]
      );
      return result.rows;
    },

    findByStudentAndCourse: async (
      studentId: string,
      courseId: string
    ): Promise<Review | null> => {
      const result = await query<Review>(
        "SELECT * FROM reviews WHERE student_id = $1 AND course_id = $2 AND deleted_at IS NULL",
        [studentId, courseId]
      );
      return result.rows[0] ?? null;
    },

    create: async (input: CreateReviewInput): Promise<Review> => {
      const result = await query<Review>(
        `INSERT INTO reviews (student_id, course_id, rating, comment)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [input.studentId, input.courseId, input.rating, input.comment || null]
      );
      return result.rows[0]!;
    },

    update: async (id: string, input: UpdateReviewInput): Promise<Review> => {
      const fields: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      if (input.rating !== undefined) {
        fields.push(`rating = $${paramIndex++}`);
        values.push(input.rating);
      }

      if (input.comment !== undefined) {
        fields.push(`comment = $${paramIndex++}`);
        values.push(input.comment);
      }

      fields.push(`updated_at = NOW()`);
      values.push(id);

      const result = await query<Review>(
        `UPDATE reviews SET ${fields.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
        values
      );

      return result.rows[0]!;
    },

    delete: async (id: string): Promise<void> => {
      await query("UPDATE reviews SET deleted_at = NOW() WHERE id = $1", [id]);
    },

    getCourseStats: async (courseId: string): Promise<CourseRatingStats> => {
      const result = await query<{
        total_reviews: string;
        average_rating: string;
        five_star_count: string;
        four_star_count: string;
        three_star_count: string;
        two_star_count: string;
        one_star_count: string;
      }>(
        `SELECT 
           COUNT(*) as total_reviews,
           COALESCE(AVG(rating), 0) as average_rating,
           COUNT(CASE WHEN rating = 5 THEN 1 END) as five_star_count,
           COUNT(CASE WHEN rating = 4 THEN 1 END) as four_star_count,
           COUNT(CASE WHEN rating = 3 THEN 1 END) as three_star_count,
           COUNT(CASE WHEN rating = 2 THEN 1 END) as two_star_count,
           COUNT(CASE WHEN rating = 1 THEN 1 END) as one_star_count
         FROM reviews
         WHERE course_id = $1 AND deleted_at IS NULL`,
        [courseId]
      );

      const stats = result.rows[0];
      return {
        totalReviews: parseInt(stats?.total_reviews || "0", 10),
        avgRating: parseFloat(stats?.average_rating || "0"),
        ratingDistribution: {
          1: parseInt(stats?.one_star_count || "0", 10),
          2: parseInt(stats?.two_star_count || "0", 10),
          3: parseInt(stats?.three_star_count || "0", 10),
          4: parseInt(stats?.four_star_count || "0", 10),
          5: parseInt(stats?.five_star_count || "0", 10),
        },
      };
    },
  };
};
