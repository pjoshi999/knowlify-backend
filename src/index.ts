import { config, validateConfig } from "./shared/config.js";
import { createDatabasePool } from "./infrastructure/database/pool.js";
import { createRedisClient } from "./infrastructure/cache/redis.js";
import { createServer } from "./api/server.js";
import { createAuthRoutes } from "./api/routes/auth.routes.js";
import { createUserRepository } from "./infrastructure/repositories/user.repository.js";
import { createJWTAuthService } from "./infrastructure/auth/jwt.service.js";

const startServer = async (): Promise<void> => {
  try {
    validateConfig();

    console.warn("Initializing database connection...");
    createDatabasePool({
      connectionString: config.database.url,
      min: config.database.poolMin,
      max: config.database.poolMax,
    });

    console.warn("Initializing Redis connection...");
    await createRedisClient({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
    });

    console.warn("Initializing services...");
    const userRepository = createUserRepository();
    const authService = createJWTAuthService();

    console.warn("Creating auth routes...");
    const authRoutes = createAuthRoutes(userRepository, authService);

    console.warn("Starting Express server...");
    const app = createServer({ authRoutes });

    app.listen(config.server.port, config.server.host, () => {
      console.warn(
        `Server ready at http://${config.server.host}:${config.server.port}`
      );
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

const shutdown = (): void => {
  console.warn("Shutting down gracefully...");
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

void startServer();
