import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import { getRedisClient } from "../../infrastructure/cache/redis.js";
import { config } from "../../shared/config.js";

const createRateLimiter = (options?: {
  windowMs?: number;
  max?: number;
  message?: string;
}) => {
  return rateLimit({
    windowMs: options?.windowMs || config.rateLimit.windowMs,
    max: options?.max || config.rateLimit.maxRequests,
    message: options?.message || "Too many requests, please try again later",
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      sendCommand: (...args: string[]) => getRedisClient().sendCommand(args),
      prefix: "rate-limit:",
    }),
  });
};

// Rate limiter instances (initialized after Redis connection)
let _authRateLimiter: ReturnType<typeof rateLimit> | null = null;
let _apiRateLimiter: ReturnType<typeof rateLimit> | null = null;
let _publicRateLimiter: ReturnType<typeof rateLimit> | null = null;

// Initialize all rate limiters - must be called after Redis is connected
export const initializeRateLimiters = (): void => {
  _authRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 requests per window
    message: "Too many authentication attempts, please try again later",
  });

  _apiRateLimiter = createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
  });

  _publicRateLimiter = createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 200, // 200 requests per minute
  });
};

// Strict rate limiter for auth endpoints
export const authRateLimiter = (req: any, res: any, next: any) => {
  if (!_authRateLimiter) {
    throw new Error(
      "Rate limiters not initialized. Call initializeRateLimiters first."
    );
  }
  return _authRateLimiter(req, res, next);
};

// Standard rate limiter for API endpoints
export const apiRateLimiter = (req: any, res: any, next: any) => {
  if (!_apiRateLimiter) {
    throw new Error(
      "Rate limiters not initialized. Call initializeRateLimiters first."
    );
  }
  return _apiRateLimiter(req, res, next);
};

// Lenient rate limiter for public endpoints
export const publicRateLimiter = (req: any, res: any, next: any) => {
  if (!_publicRateLimiter) {
    throw new Error(
      "Rate limiters not initialized. Call initializeRateLimiters first."
    );
  }
  return _publicRateLimiter(req, res, next);
};
