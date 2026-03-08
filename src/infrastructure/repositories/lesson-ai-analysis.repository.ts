/**
 * Lesson AI Analysis Repository
 * 
 * Database operations for AI-generated lesson analysis
 */

import { query } from "../database/pool.js";
import {
  LessonAIAnalysis,
  CreateLessonAIAnalysisInput,
} from "../../domain/models/lesson-ai-analysis.model.js";

interface LessonAIAnalysisRow {
  id: string;
  lesson_id: string;
  summary: string;
  topics: string; // JSONB stored as string
  learning_objectives: string; // JSONB stored as string
  key_points: string; // JSONB stored as string
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  transcription?: string;
  analyzed_at: Date;
  created_at: Date;
  updated_at: Date;
}

const mapToLessonAIAnalysis = (row: LessonAIAnalysisRow): LessonAIAnalysis => ({
  id: row.id,
  lessonId: row.lesson_id,
  summary: row.summary,
  topics: JSON.parse(row.topics),
  learningObjectives: JSON.parse(row.learning_objectives),
  keyPoints: JSON.parse(row.key_points),
  difficulty: row.difficulty,
  transcription: row.transcription,
  analyzedAt: row.analyzed_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class LessonAIAnalysisRepository {
  /**
   * Create or update AI analysis for a lesson
   */
  async upsertAnalysis(input: CreateLessonAIAnalysisInput): Promise<LessonAIAnalysis> {
    const result = await query<LessonAIAnalysisRow>(
      `INSERT INTO lesson_ai_analysis 
        (lesson_id, summary, topics, learning_objectives, key_points, difficulty, transcription, analyzed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (lesson_id) 
       DO UPDATE SET
         summary = EXCLUDED.summary,
         topics = EXCLUDED.topics,
         learning_objectives = EXCLUDED.learning_objectives,
         key_points = EXCLUDED.key_points,
         difficulty = EXCLUDED.difficulty,
         transcription = EXCLUDED.transcription,
         analyzed_at = EXCLUDED.analyzed_at,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        input.lessonId,
        input.summary,
        JSON.stringify(input.topics),
        JSON.stringify(input.learningObjectives),
        JSON.stringify(input.keyPoints),
        input.difficulty || null,
        input.transcription || null,
        input.analyzedAt,
      ]
    );

    if (!result.rows[0]) {
      throw new Error("Failed to create/update lesson AI analysis");
    }

    return mapToLessonAIAnalysis(result.rows[0]);
  }

  /**
   * Get AI analysis for a lesson
   */
  async getAnalysisByLessonId(lessonId: string): Promise<LessonAIAnalysis | null> {
    const result = await query<LessonAIAnalysisRow>(
      "SELECT * FROM lesson_ai_analysis WHERE lesson_id = $1",
      [lessonId]
    );

    return result.rows[0] ? mapToLessonAIAnalysis(result.rows[0]) : null;
  }

  /**
   * Delete AI analysis for a lesson
   */
  async deleteAnalysis(lessonId: string): Promise<void> {
    await query(
      "DELETE FROM lesson_ai_analysis WHERE lesson_id = $1",
      [lessonId]
    );
  }

  /**
   * Check if analysis exists for a lesson
   */
  async hasAnalysis(lessonId: string): Promise<boolean> {
    const result = await query<{ exists: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM lesson_ai_analysis WHERE lesson_id = $1) as exists",
      [lessonId]
    );

    return result.rows[0]?.exists || false;
  }

  /**
   * Get all lessons without AI analysis for a course
   */
  async getLessonsWithoutAnalysisByCourse(courseId: string): Promise<string[]> {
    const result = await query<{ lesson_id: string }>(
      `SELECT l.id as lesson_id
       FROM lessons l
       INNER JOIN modules m ON l.module_id = m.id
       LEFT JOIN lesson_ai_analysis la ON l.id = la.lesson_id
       WHERE m.course_id = $1 AND la.id IS NULL
       ORDER BY m."order", l."order"`,
      [courseId]
    );

    return result.rows.map(row => row.lesson_id);
  }

  /**
   * Get analysis statistics for a course
   */
  async getAnalysisStatsByCourse(courseId: string): Promise<{
    totalLessons: number;
    analyzedLessons: number;
    pendingLessons: number;
  }> {
    const result = await query<{
      total_lessons: string;
      analyzed_lessons: string;
    }>(
      `SELECT 
        COUNT(l.id) as total_lessons,
        COUNT(la.id) as analyzed_lessons
       FROM lessons l
       INNER JOIN modules m ON l.module_id = m.id
       LEFT JOIN lesson_ai_analysis la ON l.id = la.lesson_id
       WHERE m.course_id = $1`,
      [courseId]
    );

    const totalLessons = parseInt(result.rows[0]?.total_lessons || '0');
    const analyzedLessons = parseInt(result.rows[0]?.analyzed_lessons || '0');

    return {
      totalLessons,
      analyzedLessons,
      pendingLessons: totalLessons - analyzedLessons,
    };
  }
}

export const createLessonAIAnalysisRepository = (): LessonAIAnalysisRepository => {
  return new LessonAIAnalysisRepository();
};
