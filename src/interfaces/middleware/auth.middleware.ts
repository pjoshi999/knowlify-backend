import { Request, Response, NextFunction } from "express";

import { User, UserRole } from "../../domain/types/user.types.js";
import {
  UnauthorizedError,
  ForbiddenError,
} from "../../domain/errors/domain.errors.js";
import { createValidateTokenUseCase } from "../../application/use-cases/auth/validate-token.use-case.js";
import { UserRepositoryPort } from "../../application/ports/user.repository.port.js";
import { AuthPort } from "../../application/ports/auth.port.js";
import { verifySupabaseToken } from "../../infrastructure/auth/supabase.service.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
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
  const toRole = (role?: string): UserRole => {
    if (role?.toLowerCase() === "instructor") return "INSTRUCTOR";
    if (role?.toLowerCase() === "admin") return "ADMIN";
    return "STUDENT";
  };

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
      let user: User;

      try {
        // Primary path: app-issued JWT
        user = await validateToken(token);
      } catch {
        // Fallback path: Supabase JWT
        const supabaseUser = await verifySupabaseToken(token);
        if (!supabaseUser?.email) {
          throw new UnauthorizedError("Invalid authentication token");
        }
        const roleFromMetadata =
          (supabaseUser as unknown as { app_metadata?: { role?: string } })
            .app_metadata?.role || supabaseUser.user_metadata?.["role"];
        const mappedRole = toRole(roleFromMetadata);

        const existingUser = await userRepository.findByEmail(
          supabaseUser.email
        );
        const desiredName =
          supabaseUser.user_metadata?.name ||
          supabaseUser.user_metadata?.full_name ||
          supabaseUser.email.split("@")[0] ||
          "User";
        const desiredAvatar =
          supabaseUser.user_metadata?.avatar_url ||
          supabaseUser.user_metadata?.picture;

        if (existingUser) {
          const needsRoleUpdate = existingUser.role !== mappedRole;
          const needsNameUpdate = Boolean(
            desiredName && existingUser.name !== desiredName
          );
          const needsAvatarUpdate = Boolean(
            desiredAvatar && existingUser.avatarUrl !== desiredAvatar
          );

          if (needsRoleUpdate || needsNameUpdate || needsAvatarUpdate) {
            user = await userRepository.update(existingUser.id, {
              ...(needsRoleUpdate ? { role: mappedRole } : {}),
              ...(needsNameUpdate ? { name: desiredName } : {}),
              ...(needsAvatarUpdate ? { avatarUrl: desiredAvatar } : {}),
            });
          } else {
            user = existingUser;
          }
        } else {
          // Auto-provision users signing in via Supabase OAuth/email auth
          const hashedPassword = await authService.hashPassword(
            Math.random().toString(36).slice(2)
          );
          user = await userRepository.create({
            email: supabaseUser.email,
            password: "",
            name: desiredName,
            role: mappedRole,
            hashedPassword,
          });

          if (desiredAvatar) {
            user = await userRepository.update(user.id, {
              avatarUrl: desiredAvatar,
            });
          }
        }
      }

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
