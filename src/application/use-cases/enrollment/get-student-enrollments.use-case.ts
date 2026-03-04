import { EnrollmentRepositoryPort } from "../../ports/enrollment.repository.port.js";
import { EnrollmentWithCourse } from "../../../domain/types/enrollment.types.js";

export type GetStudentEnrollmentsUseCase = (
  studentId: string
) => Promise<EnrollmentWithCourse[]>;

export const createGetStudentEnrollmentsUseCase = (
  enrollmentRepository: EnrollmentRepositoryPort
): GetStudentEnrollmentsUseCase => {
  return async (studentId: string): Promise<EnrollmentWithCourse[]> => {
    const enrollments = await enrollmentRepository.findByStudent(studentId);
    return enrollments;
  };
};
