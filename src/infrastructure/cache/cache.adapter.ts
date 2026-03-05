import { CachePort } from "../../application/ports/cache.port.js";
import { getRedisClient } from "./redis.js";

export const createCacheAdapter = (): CachePort => {
  const redis = getRedisClient();

  return {
    get: async <T>(key: string): Promise<T | null> => {
      const value = await redis.get(key);
      if (!value) return null;

      try {
        return JSON.parse(value) as T;
      } catch {
        return value as T;
      }
    },

    set: async (key: string, value: unknown, ttl?: number): Promise<void> => {
      const serialized =
        typeof value === "string" ? value : JSON.stringify(value);

      if (ttl) {
        await redis.setEx(key, ttl, serialized);
      } else {
        await redis.set(key, serialized);
      }
    },

    delete: async (key: string): Promise<void> => {
      await redis.del(key);
    },

    deletePattern: async (pattern: string): Promise<void> => {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(keys);
      }
    },

    exists: async (key: string): Promise<boolean> => {
      const result = await redis.exists(key);
      return result === 1;
    },

    ttl: async (key: string): Promise<number> => {
      return await redis.ttl(key);
    },

    expire: async (key: string, seconds: number): Promise<void> => {
      await redis.expire(key, seconds);
    },
  };
};
