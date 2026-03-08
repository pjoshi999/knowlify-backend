/**
 * Lesson Domain Model
 * 
 * Represents an individual learning unit within a module
 */

export type AssetType = 'VIDEO' | 'PDF' | 'IMAGE' | 'QUIZ' | 'EXAM' | 'NOTE' | 'OTHER';

export interface Lesson {
  id: string;
  moduleId: string;
  title: string;
  description?: string;
  type: AssetType;
  order: number;
  assetId?: string;
  duration?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateLessonInput {
  moduleId: string;
  title: string;
  description?: string;
  type: AssetType;
  order: number;
  assetId?: string;
  duration?: number;
}

export interface UpdateLessonInput {
  title?: string;
  description?: string;
  type?: AssetType;
  order?: number;
  assetId?: string;
  duration?: number;
}

export interface LessonWithAnalysis extends Lesson {
  assetUrl?: string;
  aiAnalysis?: {
    summary: string;
    topics: string[];
    learningObjectives: string[];
    keyPoints: string[];
    difficulty?: 'beginner' | 'intermediate' | 'advanced';
    analyzedAt: Date;
  };
}
