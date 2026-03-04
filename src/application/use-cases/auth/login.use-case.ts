import {
  AuthSession,
  LoginCredentials,
  UserWithPassword,
} from "../../../domain/types/user.types.js";
import {
  validateEmail,
  validatePassword,
} from "../../../domain/validation/user.validation.js";
import {
  ValidationError,
  InvalidCredentialsError,
} from "../../../domain/errors/domain.errors.js";
import { UserRepositoryPort } from "../../ports/user.repository.port.js";
import { AuthPort } from "../../ports/auth.port.js";

export const createLoginUseCase = (
  userRepository: UserRepositoryPort,
  authService: AuthPort
) => {
  return async (credentials: LoginCredentials): Promise<AuthSession> => {
    const emailError = validateEmail(credentials.email);
    if (emailError) {
      throw new ValidationError(emailError, "email");
    }

    const passwordError = validatePassword(credentials.password);
    if (passwordError) {
      throw new ValidationError(passwordError, "password");
    }

    const user = (await userRepository.findByEmail(
      credentials.email.toLowerCase()
    )) as UserWithPassword | null;

    if (!user) {
      throw new InvalidCredentialsError();
    }

    const isPasswordValid = await authService.verifyPassword(
      credentials.password,
      user.password
    );

    if (!isPasswordValid) {
      throw new InvalidCredentialsError();
    }

    const token = await authService.generateToken(
      user.id,
      user.email,
      user.role
    );
    const refreshToken = await authService.generateRefreshToken(user.id);

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15);

    return {
      userId: user.id,
      token,
      refreshToken,
      expiresAt,
    };
  };
};
