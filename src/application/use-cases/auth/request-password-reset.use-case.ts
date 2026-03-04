import { PasswordResetRequest } from "../../../domain/types/user.types.js";
import { validateEmail } from "../../../domain/validation/user.validation.js";
import {
  ValidationError,
  NotFoundError,
} from "../../../domain/errors/domain.errors.js";
import { UserRepositoryPort } from "../../ports/user.repository.port.js";
import { AuthPort } from "../../ports/auth.port.js";

export const createRequestPasswordResetUseCase = (
  userRepository: UserRepositoryPort,
  authService: AuthPort
) => {
  return async (request: PasswordResetRequest): Promise<{ token: string }> => {
    const emailError = validateEmail(request.email);
    if (emailError) {
      throw new ValidationError(emailError, "email");
    }

    const user = await userRepository.findByEmail(request.email.toLowerCase());
    if (!user) {
      throw new NotFoundError("User");
    }

    const resetToken = await authService.generatePasswordResetToken(user.id);

    return { token: resetToken };
  };
};
