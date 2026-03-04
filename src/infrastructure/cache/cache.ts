import * as redis from "./redis.js";

export interface CachePort {
  get: <T>(key: string) => Promise<T | null>;
  set: (key: string, value: unknown, ttlSeconds?: number) => Promise<void>;
  delete: (key: string) => Promise<void>;
  deletePattern: (pattern: string) => Promise<void>;
  exists: (key: string) => Promise<boolean>;
  expire: (key: string, seconds: number) => Promise<void>;
}

export const createCacheAdapter = (): CachePort => {
  return {
    get: async <T>(key: string): Promise<T | null> => {
      return redis.get<T>(key);
    },

    set: async (
      key: string,
      value: unknown,
      ttlSeconds?: number
    ): Promise<void> => {
      await redis.set(key, value, ttlSeconds);
    },

    delete: async (key: string): Promise<void> => {
      await redis.del(key);
    },

    deletePattern: async (pattern: string): Promise<void> => {
      await redis.delPattern(pattern);
    },

    exists: async (key: string): Promise<boolean> => {
      return redis.exists(key);
    },

    expire: async (key: string, seconds: number): Promise<void> => {
      await redis.expire(key, seconds);
    },
  };
};

export const cacheAsideGet = async <T>(
  key: string,
  ttl: number,
  fetchFn: () => Promise<T>
): Promise<T> => {
  const cached = await redis.get<T>(key);
  if (cached !== null) {
    return cached;
  }

  const fresh = await fetchFn();
  await redis.set(key, fresh, ttl);
  return fresh;
};

export const cacheAsideSet = async <T>(
  key: string,
  value: T,
  ttl: number
): Promise<void> => {
  await redis.set(key, value, ttl);
};

export const invalidateCache = async (keys: string[]): Promise<void> => {
  for (const key of keys) {
    await redis.del(key);
  }
};

export const invalidateCachePattern = async (
  pattern: string
): Promise<void> => {
  await redis.delPattern(pattern);
};
