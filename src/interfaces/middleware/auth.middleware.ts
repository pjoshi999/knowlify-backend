import { Request, Response, NextFunction } from "express";

import { User, UserRole } from "../../domain/types/user.types.js";
import {
  UnauthorizedError,
  ForbiddenError,
} from "../../domain/errors/domain.errors.js";
import { createValidateTokenUseCase } from "../../application/use-cases/auth/validate-token.use-case.js";
import { UserRepositoryPort } from "../../application/ports/user.repository.port.js";
import { AuthPort } from "../../application/ports/auth.port.js";

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export const createAuthMiddleware = (
  userRepository: UserRepositoryPort,
  authService: AuthPort
) => {
  const validateToken = createValidateTokenUseCase(userRepository, authService);

  return async (
    req: Request,
    _res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader?.startsWith("Bearer ")) {
        throw new UnauthorizedError("Missing or invalid authorization header");
      }

      const token = authHeader.substring(7);
      const user = await validateToken(token);

      req.user = user;
      next();
    } catch (error) {
      next(error);
    }
  };
};

export const createRoleMiddleware = (...allowedRoles: UserRole[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedError();
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw new ForbiddenError(
        `Access denied. Required roles: ${allowedRoles.join(", ")}`
      );
    }

    next();
  };
};

// Placeholder exports for routes (will be replaced with actual middleware instances)
export const authenticate = async (
  _req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  next(new Error("Auth middleware not initialized"));
};

export const authorize = (..._roles: UserRole[]) => {
  return (_req: Request, _res: Response, next: NextFunction): void => {
    next(new Error("Role middleware not initialized"));
  };
};
