import dotenv from "dotenv";

dotenv.config();

interface Config {
  server: {
    port: number;
    host: string;
    nodeEnv: string;
  };
  database: {
    url: string;
    poolMin: number;
    poolMax: number;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };
  supabase: {
    url: string;
    anonKey: string;
    serviceRoleKey: string;
  };
  jwt: {
    secret: string;
    refreshSecret: string;
    expiresIn: string;
    refreshExpiresIn: string;
  };
  stripe: {
    secretKey: string;
    publishableKey: string;
    webhookSecret: string;
  };
  openai: {
    apiKey: string;
    model: string;
    maxTokens: number;
  };
  aws: {
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    s3BucketName: string;
    sqsQueueUrl: string;
    sqsHighPriorityQueueUrl: string;
    sqsLowPriorityQueueUrl: string;
  };
  videoUpload: {
    chunkSize: number;
    sessionTtl: number;
    maxConcurrentUploads: number;
    dailyQuotaGB: number;
    enableTransferAcceleration: boolean;
  };
  cors: {
    origin: string;
    credentials: boolean;
  };
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
  logging: {
    level: string;
  };
  frontend: {
    url: string;
  };
  oauth: {
    redirectUris: string[];
  };
}

const getEnv = (key: string, defaultValue?: string): string => {
  const value = process.env[key] ?? defaultValue;
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

const getEnvNumber = (key: string, defaultValue?: number): number => {
  const value = process.env[key];
  if (!value) {
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(`Missing required environment variable: ${key}`);
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Invalid number for environment variable: ${key}`);
  }
  return parsed;
};

const getEnvBoolean = (key: string, defaultValue?: boolean): boolean => {
  const value = process.env[key];
  if (!value) {
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value === "true";
};

export const config: Config = {
  server: {
    port: getEnvNumber("PORT", 8080),
    host: getEnv("HOST", "localhost"),
    nodeEnv: getEnv("NODE_ENV", "development"),
  },
  database: {
    url: getEnv("DATABASE_URL"),
    poolMin: getEnvNumber("DATABASE_POOL_MIN", 2),
    poolMax: getEnvNumber("DATABASE_POOL_MAX", 10),
  },
  redis: {
    host: getEnv("REDIS_HOST", "localhost"),
    port: getEnvNumber("REDIS_PORT", 6379),
    password: process.env["REDIS_PASSWORD"],
    db: getEnvNumber("REDIS_DB", 0),
  },
  supabase: {
    url: getEnv("SUPABASE_URL"),
    anonKey: getEnv("SUPABASE_ANON_KEY"),
    serviceRoleKey: getEnv("SUPABASE_SERVICE_ROLE_KEY"),
  },
  jwt: {
    secret: getEnv("JWT_SECRET"),
    refreshSecret: getEnv("JWT_REFRESH_SECRET"),
    expiresIn: getEnv("JWT_EXPIRES_IN", "15m"),
    refreshExpiresIn: getEnv("JWT_REFRESH_EXPIRES_IN", "7d"),
  },
  stripe: {
    secretKey: getEnv("STRIPE_SECRET_KEY"),
    publishableKey: getEnv("STRIPE_PUBLISHABLE_KEY"),
    webhookSecret: getEnv("STRIPE_WEBHOOK_SECRET"),
  },
  openai: {
    apiKey: getEnv("OPENAI_API_KEY"),
    model: getEnv("OPENAI_MODEL", "gpt-4"),
    maxTokens: getEnvNumber("OPENAI_MAX_TOKENS", 2000),
  },
  aws: {
    region: getEnv("AWS_REGION", "us-east-1"),
    accessKeyId: getEnv("AWS_ACCESS_KEY_ID"),
    secretAccessKey: getEnv("AWS_SECRET_ACCESS_KEY"),
    s3BucketName: getEnv("S3_BUCKET_NAME"),
    sqsQueueUrl: getEnv("SQS_QUEUE_URL", ""),
    sqsHighPriorityQueueUrl: getEnv("SQS_HIGH_PRIORITY_QUEUE_URL", ""),
    sqsLowPriorityQueueUrl: getEnv("SQS_LOW_PRIORITY_QUEUE_URL", ""),
  },
  videoUpload: {
    chunkSize: getEnvNumber("VIDEO_UPLOAD_CHUNK_SIZE", 104857600), // 100MB
    sessionTtl: getEnvNumber("VIDEO_UPLOAD_SESSION_TTL", 86400), // 24 hours
    maxConcurrentUploads: getEnvNumber("VIDEO_UPLOAD_MAX_CONCURRENT", 3),
    dailyQuotaGB: getEnvNumber("VIDEO_UPLOAD_DAILY_QUOTA_GB", 100),
    enableTransferAcceleration: getEnvBoolean(
      "VIDEO_UPLOAD_ENABLE_ACCELERATION",
      true
    ),
  },
  cors: {
    origin: getEnv("CORS_ORIGIN", "http://localhost:5173"),
    credentials: getEnvBoolean("CORS_CREDENTIALS", true),
  },
  rateLimit: {
    windowMs: getEnvNumber("RATE_LIMIT_WINDOW_MS", 60000),
    maxRequests: getEnvNumber("RATE_LIMIT_MAX_REQUESTS", 100),
  },
  logging: {
    level: getEnv("LOG_LEVEL", "info"),
  },
  frontend: {
    url: getEnv("FRONTEND_URL", "http://localhost:5173"),
  },
  oauth: {
    redirectUris: getEnv(
      "OAUTH_REDIRECT_URIS",
      "http://localhost:5173/auth/callback"
    ).split(","),
  },
};

export const validateConfig = (): void => {
  if (config.jwt.secret.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters");
  }

  if (config.jwt.refreshSecret.length < 32) {
    throw new Error("JWT_REFRESH_SECRET must be at least 32 characters");
  }
};
