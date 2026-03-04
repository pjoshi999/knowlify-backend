import {
  Enrollment,
  CreateEnrollmentInput,
  UpdateProgressInput,
  EnrollmentWithCourse,
} from "../../domain/types/enrollment.types.js";

export interface EnrollmentRepositoryPort {
  findById: (id: string) => Promise<Enrollment | null>;
  findByStudentAndCourse: (
    studentId: string,
    courseId: string
  ) => Promise<Enrollment | null>;
  findByStudent: (studentId: string) => Promise<EnrollmentWithCourse[]>;
  findByCourse: (courseId: string) => Promise<Enrollment[]>;
  create: (input: CreateEnrollmentInput) => Promise<Enrollment>;
  updateProgress: (
    id: string,
    input: UpdateProgressInput
  ) => Promise<Enrollment>;
  updateLastAccessed: (id: string) => Promise<void>;
  exists: (studentId: string, courseId: string) => Promise<boolean>;
}
