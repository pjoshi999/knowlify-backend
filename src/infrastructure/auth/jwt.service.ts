import bcrypt from "bcrypt";
import jwt, { SignOptions } from "jsonwebtoken";

import { config } from "../../shared/config.js";
import { AuthPort } from "../../application/ports/auth.port.js";
import {
  InvalidTokenError,
  TokenExpiredError,
} from "../../domain/errors/domain.errors.js";
import * as redis from "../cache/redis.js";

const SALT_ROUNDS = 12;

export const createJWTAuthService = (): AuthPort => {
  return {
    hashPassword: async (password: string): Promise<string> => {
      return bcrypt.hash(password, SALT_ROUNDS);
    },

    verifyPassword: async (
      password: string,
      hashedPassword: string
    ): Promise<boolean> => {
      return bcrypt.compare(password, hashedPassword);
    },

    generateToken: async (
      userId: string,
      email: string,
      role: string
    ): Promise<string> => {
      return jwt.sign({ userId, email, role }, config.jwt.secret, {
        expiresIn: config.jwt.expiresIn,
      } as SignOptions);
    },

    generateRefreshToken: async (userId: string): Promise<string> => {
      return jwt.sign({ userId }, config.jwt.refreshSecret, {
        expiresIn: config.jwt.refreshExpiresIn,
      } as SignOptions);
    },

    verifyToken: async (
      token: string
    ): Promise<{ userId: string; email: string; role: string }> => {
      try {
        const payload = jwt.verify(token, config.jwt.secret) as {
          userId: string;
          email: string;
          role: string;
        };

        const isBlacklisted = await redis.exists(`blacklist:${token}`);
        if (isBlacklisted) {
          throw new InvalidTokenError();
        }

        return payload;
      } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
          throw new TokenExpiredError();
        }
        throw new InvalidTokenError();
      }
    },

    verifyRefreshToken: async (token: string): Promise<{ userId: string }> => {
      try {
        const payload = jwt.verify(token, config.jwt.refreshSecret) as {
          userId: string;
        };
        return payload;
      } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
          throw new TokenExpiredError();
        }
        throw new InvalidTokenError();
      }
    },

    invalidateToken: async (token: string): Promise<void> => {
      const decoded = jwt.decode(token) as { exp: number } | null;
      if (decoded?.exp) {
        const ttl = decoded.exp - Math.floor(Date.now() / 1000);
        if (ttl > 0) {
          await redis.set(`blacklist:${token}`, "1", ttl);
        }
      }
    },

    generatePasswordResetToken: async (userId: string): Promise<string> => {
      return jwt.sign({ userId, type: "password-reset" }, config.jwt.secret, {
        expiresIn: "1h",
      } as SignOptions);
    },

    verifyPasswordResetToken: async (
      token: string
    ): Promise<{ userId: string }> => {
      try {
        const payload = jwt.verify(token, config.jwt.secret) as {
          userId: string;
          type: string;
        };

        if (payload.type !== "password-reset") {
          throw new InvalidTokenError();
        }

        return { userId: payload.userId };
      } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
          throw new TokenExpiredError();
        }
        throw new InvalidTokenError();
      }
    },
  };
};
