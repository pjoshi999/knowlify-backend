import { User } from "../../../domain/types/user.types.js";
import {
  validateEmail,
  validatePassword,
  validateName,
  validateUserRole,
} from "../../../domain/validation/user.validation.js";
import {
  ValidationError,
  UserAlreadyExistsError,
} from "../../../domain/errors/domain.errors.js";
import { UserRepositoryPort } from "../../ports/user.repository.port.js";
import { AuthPort } from "../../ports/auth.port.js";

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
  role: string;
}

export const createRegisterUseCase = (
  userRepository: UserRepositoryPort,
  authService: AuthPort
) => {
  return async (input: RegisterInput): Promise<User> => {
    const emailError = validateEmail(input.email);
    if (emailError) {
      throw new ValidationError(emailError, "email");
    }

    const passwordError = validatePassword(input.password);
    if (passwordError) {
      throw new ValidationError(passwordError, "password");
    }

    const nameError = validateName(input.name);
    if (nameError) {
      throw new ValidationError(nameError, "name");
    }

    const roleError = validateUserRole(input.role);
    if (roleError) {
      throw new ValidationError(roleError, "role");
    }

    const emailExists = await userRepository.exists(input.email);
    if (emailExists) {
      throw new UserAlreadyExistsError(input.email);
    }

    const hashedPassword = await authService.hashPassword(input.password);

    const user = await userRepository.create({
      email: input.email.toLowerCase(),
      password: input.password,
      name: input.name,
      role: input.role as "STUDENT" | "INSTRUCTOR" | "ADMIN",
      hashedPassword,
    });

    return user;
  };
};
