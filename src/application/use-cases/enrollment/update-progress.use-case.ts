import { EnrollmentRepositoryPort } from "../../ports/enrollment.repository.port.js";
import {
  Enrollment,
  UpdateProgressInput,
} from "../../../domain/types/enrollment.types.js";
import { NotFoundError } from "../../../domain/errors/domain.errors.js";

export type UpdateProgressUseCase = (
  enrollmentId: string,
  input: UpdateProgressInput
) => Promise<Enrollment>;

export const createUpdateProgressUseCase = (
  enrollmentRepository: EnrollmentRepositoryPort
): UpdateProgressUseCase => {
  return async (
    enrollmentId: string,
    input: UpdateProgressInput
  ): Promise<Enrollment> => {
    const enrollment = await enrollmentRepository.findById(enrollmentId);

    if (!enrollment) {
      throw new NotFoundError("Enrollment not found");
    }

    // Update last accessed time
    await enrollmentRepository.updateLastAccessed(enrollmentId);

    // Update progress
    const updatedEnrollment = await enrollmentRepository.updateProgress(
      enrollmentId,
      input
    );

    return updatedEnrollment;
  };
};
