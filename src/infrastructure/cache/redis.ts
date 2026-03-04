import { createClient, RedisClientType } from "redis";

interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
}

let client: RedisClientType | null = null;

export const createRedisClient = async (
  config: RedisConfig
): Promise<RedisClientType> => {
  if (client) {
    return client;
  }

  client = createClient({
    socket: {
      host: config.host,
      port: config.port,
    },
    password: config.password,
    database: config.db ?? 0,
  });

  client.on("error", (err: Error) => {
    console.error("Redis client error", err);
  });

  client.on("connect", () => {
    console.warn("Redis client connected");
  });

  client.on("ready", () => {
    console.warn("Redis client ready");
  });

  client.on("end", () => {
    console.warn("Redis client disconnected");
  });

  await client.connect();

  return client;
};

export const getRedisClient = (): RedisClientType => {
  if (!client) {
    throw new Error(
      "Redis client not initialized. Call createRedisClient first."
    );
  }
  return client;
};

export const closeRedisClient = async (): Promise<void> => {
  if (client) {
    await client.quit();
    client = null;
  }
};

export const redisHealthCheck = async (): Promise<boolean> => {
  try {
    const pong = await getRedisClient().ping();
    return pong === "PONG";
  } catch (error) {
    console.error("Redis health check failed", error);
    return false;
  }
};

export const get = async <T>(key: string): Promise<T | null> => {
  const value = await getRedisClient().get(key);
  if (!value) return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    return value as T;
  }
};

export const set = async (
  key: string,
  value: unknown,
  ttlSeconds?: number
): Promise<void> => {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);

  if (ttlSeconds) {
    await getRedisClient().setEx(key, ttlSeconds, serialized);
  } else {
    await getRedisClient().set(key, serialized);
  }
};

export const del = async (key: string): Promise<void> => {
  await getRedisClient().del(key);
};

export const delPattern = async (pattern: string): Promise<void> => {
  const keys = await getRedisClient().keys(pattern);
  if (keys.length > 0) {
    await getRedisClient().del(keys);
  }
};

export const exists = async (key: string): Promise<boolean> => {
  const result = await getRedisClient().exists(key);
  return result === 1;
};

export const expire = async (key: string, seconds: number): Promise<void> => {
  await getRedisClient().expire(key, seconds);
};

export const ttl = async (key: string): Promise<number> => {
  return getRedisClient().ttl(key);
};

export const incr = async (key: string): Promise<number> => {
  return getRedisClient().incr(key);
};

export const decr = async (key: string): Promise<number> => {
  return getRedisClient().decr(key);
};

export const hGet = async <T>(
  key: string,
  field: string
): Promise<T | null> => {
  const value = await getRedisClient().hGet(key, field);
  if (!value) return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    return value as T;
  }
};

export const hSet = async (
  key: string,
  field: string,
  value: unknown
): Promise<void> => {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  await getRedisClient().hSet(key, field, serialized);
};

export const hGetAll = async <T extends Record<string, unknown>>(
  key: string
): Promise<T | null> => {
  const value = await getRedisClient().hGetAll(key);
  if (!value || Object.keys(value).length === 0) return null;

  const parsed: Record<string, unknown> = {};
  for (const [field, val] of Object.entries(value)) {
    try {
      parsed[field] = JSON.parse(val);
    } catch {
      parsed[field] = val;
    }
  }

  return parsed as T;
};

export const hDel = async (key: string, field: string): Promise<void> => {
  await getRedisClient().hDel(key, field);
};
