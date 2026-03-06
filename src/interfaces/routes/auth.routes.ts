import {
  Router,
  Request,
  Response,
  NextFunction,
  RequestHandler,
} from "express";

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
import { sendSuccess, sendMessage } from "../utils/response.js";
import { config } from "../../shared/config.js";

export const createAuthRoutes = (
  userRepository: UserRepositoryPort,
  authService: AuthPort,
  authenticate: RequestHandler
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
        sendSuccess(
          res,
          {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          },
          201
        );
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
        sendSuccess(res, session);
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
        sendMessage(res, "Logged out successfully");
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
        sendSuccess(res, result);
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
        sendMessage(res, "Password reset successfully");
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
        sendSuccess(res, session);
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
        sendSuccess(res, session);
      } catch (error) {
        next(error);
      }
    }
  );

  // Current authenticated user profile (works for both app JWT and Supabase JWT)
  router.get(
    "/me",
    authenticate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const user = req.user!;
        sendSuccess(res, {
          id: user.id,
          email: user.email,
          role: user.role,
          name: user.name,
          avatarUrl: user.avatarUrl,
          bio: user.bio,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // OAuth callback endpoint for handling redirects
  router.get(
    "/oauth/callback",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { access_token, provider } = req.query;

        if (!access_token || !provider) {
          return res.redirect(
            `${config.frontend.url}/auth/error?message=Missing OAuth parameters`
          );
        }

        const session = await oauthLogin({
          accessToken: access_token as string,
          provider: provider as "google" | "github",
        } as OAuthLoginInput);

        // Redirect to frontend with tokens
        const redirectUrl = new URL(`${config.frontend.url}/auth/callback`);
        redirectUrl.searchParams.set("access_token", session.accessToken);
        redirectUrl.searchParams.set("refresh_token", session.refreshToken);
        redirectUrl.searchParams.set(
          "expires_at",
          session.expiresAt.toISOString()
        );

        res.redirect(redirectUrl.toString());
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
};
