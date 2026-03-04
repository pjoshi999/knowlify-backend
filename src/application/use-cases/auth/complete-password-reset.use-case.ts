import { PasswordResetCompletion } from "../../../domain/types/user.types.js";
import { validatePassword } from "../../../domain/validation/user.validation.js";
import {
  ValidationError,
  NotFoundError,
} from "../../../domain/errors/domain.errors.js";
import { UserRepositoryPort } from "../../ports/user.repository.port.js";
import { AuthPort } from "../../ports/auth.port.js";

export const createCompletePasswordResetUseCase = (
  userRepository: UserRepositoryPort,
  authService: AuthPort
) => {
  return async (completion: PasswordResetCompletion): Promise<void> => {
    const passwordError = validatePassword(completion.newPassword);
    if (passwordError) {
      throw new ValidationError(passwordError, "newPassword");
    }

    const payload = await authService.verifyPasswordResetToken(
      completion.token
    );

    const user = await userRepository.findById(payload.userId);
    if (!user) {
      throw new NotFoundError("User", payload.userId);
    }

    const hashedPassword = await authService.hashPassword(
      completion.newPassword
    );

    await userRepository.update(user.id, {
      password: hashedPassword,
    });
  };
};
