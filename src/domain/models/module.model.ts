/**
 * Module Domain Model
 * 
 * Represents a logical grouping of lessons within a course
 */

export interface Module {
  id: string;
  courseId: string;
  title: string;
  description?: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateModuleInput {
  courseId: string;
  title: string;
  description?: string;
  order: number;
}

export interface UpdateModuleInput {
  title?: string;
  description?: string;
  order?: number;
}

export interface ModuleWithLessons extends Module {
  lessons: Array<{
    id: string;
    title: string;
    description?: string;
    type: string;
    order: number;
    duration?: number;
    assetUrl?: string;
  }>;
}
