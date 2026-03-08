/**
 * Lesson AI Analysis Domain Model
 *
 * Represents AI-generated insights and analysis for a lesson
 */

export interface LessonAIAnalysis {
  id: string;
  lessonId: string;
  summary: string;
  topics: string[];
  learningObjectives: string[];
  keyPoints: string[];
  difficulty?: "beginner" | "intermediate" | "advanced";
  transcription?: string;
  analyzedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateLessonAIAnalysisInput {
  lessonId: string;
  summary: string;
  topics: string[];
  learningObjectives: string[];
  keyPoints: string[];
  difficulty?: "beginner" | "intermediate" | "advanced";
  transcription?: string;
  analyzedAt: Date;
}
