import { Router, Request, Response, NextFunction } from "express";

import {
  createRegisterUseCase,
  RegisterInput,
} from "../../application/use-cases/auth/register.use-case.js";
import { createLoginUseCase } from "../../application/use-cases/auth/login.use-case.js";
import { createLogoutUseCase } from "../../application/use-cases/auth/logout.use-case.js";
import { createRequestPasswordResetUseCase } from "../../application/use-cases/auth/request-password-reset.use-case.js";
import { createCompletePasswordResetUseCase } from "../../application/use-cases/auth/complete-password-reset.use-case.js";
import {
  createOAuthLoginUseCase,
  OAuthLoginInput,
} from "../../application/use-cases/auth/oauth-login.use-case.js";
import { UserRepositoryPort } from "../../application/ports/user.repository.port.js";
import { AuthPort } from "../../application/ports/auth.port.js";
import {
  LoginCredentials,
  PasswordResetRequest,
  PasswordResetCompletion,
} from "../../domain/types/user.types.js";

export const createAuthRoutes = (
  userRepository: UserRepositoryPort,
  authService: AuthPort
): Router => {
  const router = Router();

  const register = createRegisterUseCase(userRepository, authService);
  const login = createLoginUseCase(userRepository, authService);
  const logout = createLogoutUseCase(authService);
  const requestPasswordReset = createRequestPasswordResetUseCase(
    userRepository,
    authService
  );
  const completePasswordReset = createCompletePasswordResetUseCase(
    userRepository,
    authService
  );
  const oauthLogin = createOAuthLoginUseCase(userRepository, authService);

  router.post(
    "/register",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const user = await register(req.body as RegisterInput);
        res.status(201).json({
          success: true,
          data: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/login",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const session = await login(req.body as LoginCredentials);
        res.json({
          success: true,
          data: session,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/logout",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith("Bearer ")) {
          const token = authHeader.substring(7);
          await logout(token);
        }
        res.json({
          success: true,
          data: { message: "Logged out successfully" },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/reset-password",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await requestPasswordReset(
          req.body as PasswordResetRequest
        );
        res.json({
          success: true,
          data: result,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.put(
    "/reset-password",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await completePasswordReset(req.body as PasswordResetCompletion);
        res.json({
          success: true,
          data: { message: "Password reset successfully" },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/oauth/google",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { accessToken } = req.body as { accessToken: string };
        const session = await oauthLogin({
          accessToken,
          provider: "google",
        } as OAuthLoginInput);
        res.json({
          success: true,
          data: session,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/oauth/github",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { accessToken } = req.body as { accessToken: string };
        const session = await oauthLogin({
          accessToken,
          provider: "github",
        } as OAuthLoginInput);
        res.json({
          success: true,
          data: session,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
};
