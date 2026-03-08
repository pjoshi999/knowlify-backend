import { createClient } from "redis";

/**
 * Shared Redis client type to avoid TypeScript type incompatibility issues
 * across different modules when using pnpm.
 */
export type RedisClient = ReturnType<typeof createClient>;
