export interface CachePort {
  get: <T>(key: string) => Promise<T | null>;
  set: (key: string, value: unknown, ttl?: number) => Promise<void>;
  delete: (key: string) => Promise<void>;
  deletePattern: (pattern: string) => Promise<void>;
  exists: (key: string) => Promise<boolean>;
  ttl: (key: string) => Promise<number>;
  expire: (key: string, seconds: number) => Promise<void>;
}
