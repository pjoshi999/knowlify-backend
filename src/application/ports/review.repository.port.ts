import {
  Review,
  CreateReviewInput,
  UpdateReviewInput,
  CourseRatingStats,
} from "../../domain/types/review.types.js";

export interface ReviewRepositoryPort {
  findById: (id: string) => Promise<Review | null>;
  findByCourse: (courseId: string) => Promise<Review[]>;
  findByStudent: (studentId: string) => Promise<Review[]>;
  findByStudentAndCourse: (
    studentId: string,
    courseId: string
  ) => Promise<Review | null>;
  create: (input: CreateReviewInput) => Promise<Review>;
  update: (id: string, input: UpdateReviewInput) => Promise<Review>;
  delete: (id: string) => Promise<void>;
  getCourseStats: (courseId: string) => Promise<CourseRatingStats>;
}
