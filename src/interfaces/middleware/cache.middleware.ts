import { Request, Response, NextFunction, RequestHandler } from "express";
import { CachePort } from "../../application/ports/cache.port.js";
import { createModuleLogger } from "../../shared/logger.js";

const log = createModuleLogger("cache");

interface CacheOptions {
  ttl?: number; // seconds
  keyPrefix?: string;
  varyBy?: string[]; // Request properties to vary cache by (e.g., ['user.id', 'query.page'])
}

export const createCacheMiddleware = (
  cache: CachePort,
  options: CacheOptions = {}
): RequestHandler => {
  const { ttl = 300, keyPrefix = "api", varyBy = [] } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    // Only cache GET requests
    if (req.method !== "GET") {
      return next();
    }

    // Generate cache key
    const keyParts = [keyPrefix, req.path];

    // Add vary-by parameters
    for (const vary of varyBy) {
      const parts = vary.split(".");
      let value: unknown = req;

      for (const part of parts) {
        value = (value as Record<string, unknown>)?.[part];
      }

      if (value !== undefined) {
        const strValue =
          typeof value === "object" && value !== null
            ? JSON.stringify(value)
            : String(value as string | number | boolean);
        keyParts.push(strValue);
      }
    }

    // Add query string if present
    if (Object.keys(req.query).length > 0) {
      keyParts.push(JSON.stringify(req.query));
    }

    const cacheKey = keyParts.join(":");

    try {
      // Check cache
      const cached = await cache.get<unknown>(cacheKey);

      if (cached) {
        return res.json(cached);
      }

      // Store original json method
      const originalJson = res.json.bind(res);

      // Override json method to cache response
      res.json = function (body: unknown): Response {
        // Cache successful responses only
        if (res.statusCode >= 200 && res.statusCode < 300) {
          void cache.set(cacheKey, body, ttl);
        }

        return originalJson(body);
      };

      next();
    } catch (error) {
      log.warn({ err: error, path: req.path }, "Cache middleware error");
      next();
    }
  };
};

export const createCacheInvalidationMiddleware = (
  cache: CachePort,
  patterns: string[]
): RequestHandler => {
  return async (_req: Request, _res: Response, next: NextFunction) => {
    try {
      // Invalidate cache patterns after response
      _res.on("finish", () => {
        if (_res.statusCode >= 200 && _res.statusCode < 300) {
          for (const pattern of patterns) {
            void cache.deletePattern(pattern);
          }
        }
      });

      next();
    } catch (error) {
      log.warn({ err: error }, "Cache invalidation middleware error");
      next();
    }
  };
};
