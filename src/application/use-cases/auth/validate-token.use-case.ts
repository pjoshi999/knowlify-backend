import { User } from "../../../domain/types/user.types.js";
import {
  InvalidTokenError,
  NotFoundError,
} from "../../../domain/errors/domain.errors.js";
import { UserRepositoryPort } from "../../ports/user.repository.port.js";
import { AuthPort } from "../../ports/auth.port.js";

export const createValidateTokenUseCase = (
  userRepository: UserRepositoryPort,
  authService: AuthPort
) => {
  return async (token: string): Promise<User> => {
    if (!token) {
      throw new InvalidTokenError();
    }

    const payload = await authService.verifyToken(token);

    const user = await userRepository.findById(payload.userId);
    if (!user) {
      throw new NotFoundError("User", payload.userId);
    }

    if (user.deletedAt) {
      throw new InvalidTokenError();
    }

    return user;
  };
};
