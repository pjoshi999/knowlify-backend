import {
  Enrollment,
  CreateEnrollmentInput,
  UpdateProgressInput,
  EnrollmentWithCourse,
} from "../../domain/types/enrollment.types.js";
import { EnrollmentRepositoryPort } from "../../application/ports/enrollment.repository.port.js";
import { query } from "../database/pool.js";
import { createModuleLogger } from "../../shared/logger.js";

const log = createModuleLogger("enrollment-repository");

export const createEnrollmentRepository = (): EnrollmentRepositoryPort => {
  return {
    findById: async (id: string): Promise<Enrollment | null> => {
      const result = await query<Enrollment>(
        "SELECT * FROM enrollments WHERE id = $1",
        [id]
      );
      return result.rows[0] ?? null;
    },

    findByStudentAndCourse: async (
      studentId: string,
      courseId: string
    ): Promise<Enrollment | null> => {
      const result = await query<Enrollment>(
        "SELECT * FROM enrollments WHERE student_id = $1 AND course_id = $2",
        [studentId, courseId]
      );
      return result.rows[0] ?? null;
    },

    findByStudent: async (
      studentId: string
    ): Promise<EnrollmentWithCourse[]> => {
      log.info({ studentId }, "Querying enrollments for student");

      try {
        const result = await query<EnrollmentWithCourse>(
          `SELECT 
             e.id,
             e.student_id,
             e.course_id,
             e.payment_id,
             e.progress,
             e.enrolled_at,
             e.last_accessed_at,
             e.completed_at,
             c.name as course_name,
             c.thumbnail_url as course_thumbnail_url,
             u.name as instructor_name,
             0 as completion_percentage
           FROM enrollments e
           JOIN courses c ON e.course_id = c.id
           JOIN users u ON c.instructor_id = u.id
           WHERE e.student_id = $1
           ORDER BY e.last_accessed_at DESC`,
          [studentId]
        );

        log.info(
          { studentId, rowCount: result.rows.length },
          "Enrollment query completed"
        );

        return result.rows;
      } catch (error) {
        log.error({ err: error, studentId }, "Error querying enrollments");
        throw error;
      }
    },

    findByCourse: async (courseId: string): Promise<Enrollment[]> => {
      const result = await query<Enrollment>(
        "SELECT * FROM enrollments WHERE course_id = $1 ORDER BY enrolled_at DESC",
        [courseId]
      );
      return result.rows;
    },

    create: async (input: CreateEnrollmentInput): Promise<Enrollment> => {
      const result = await query<Enrollment>(
        `INSERT INTO enrollments (student_id, course_id, payment_id, progress)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [
          input.studentId,
          input.courseId,
          input.paymentId,
          JSON.stringify({
            completedLessons: [],
            watchedVideos: {},
          }),
        ]
      );
      return result.rows[0]!;
    },

    updateProgress: async (
      id: string,
      input: UpdateProgressInput
    ): Promise<Enrollment> => {
      // Get current enrollment
      const current = await query<Enrollment>(
        "SELECT * FROM enrollments WHERE id = $1",
        [id]
      );

      if (!current.rows[0]) {
        throw new Error("Enrollment not found");
      }

      const progress = current.rows[0].progress;

      // Update progress based on input
      if (input.lessonId && input.completed) {
        if (!progress.completedLessons.includes(input.lessonId)) {
          progress.completedLessons.push(input.lessonId);
        }
      }

      if (input.videoId && input.position !== undefined) {
        progress.watchedVideos[input.videoId] = {
          lastPosition: input.position,
          duration: progress.watchedVideos[input.videoId]?.duration || 0,
          completed: input.completed || false,
          watchedAt: new Date(),
        };
      }

      if (input.quizId && input.quizScore !== undefined) {
        progress.quizScores = progress.quizScores || {};
        progress.quizScores[input.quizId] = input.quizScore;
      }

      const result = await query<Enrollment>(
        `UPDATE enrollments 
         SET progress = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [JSON.stringify(progress), id]
      );

      return result.rows[0]!;
    },

    updateLastAccessed: async (id: string): Promise<void> => {
      await query(
        "UPDATE enrollments SET last_accessed_at = NOW() WHERE id = $1",
        [id]
      );
    },

    exists: async (studentId: string, courseId: string): Promise<boolean> => {
      const result = await query<{ exists: boolean }>(
        "SELECT EXISTS(SELECT 1 FROM enrollments WHERE student_id = $1 AND course_id = $2)",
        [studentId, courseId]
      );
      return result.rows[0]?.exists ?? false;
    },
  };
};
