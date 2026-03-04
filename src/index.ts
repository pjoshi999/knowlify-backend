import { config, validateConfig } from "./shared/config.js";
import { createDatabasePool } from "./infrastructure/database/pool.js";
import { createRedisClient } from "./infrastructure/cache/redis.js";
import { createServer } from "./api/server.js";
import { createAuthRoutes } from "./api/routes/auth.routes.js";
import { createCourseRoutes } from "./api/routes/course.routes.js";
import { createEnrollmentRoutes } from "./api/routes/enrollment.routes.js";
import { createReviewRoutes } from "./api/routes/review.routes.js";
import { createUserRepository } from "./infrastructure/repositories/user.repository.js";
import { createCourseRepository } from "./infrastructure/repositories/course.repository.js";
import { createEnrollmentRepository } from "./infrastructure/repositories/enrollment.repository.js";
import { createReviewRepository } from "./infrastructure/repositories/review.repository.js";
import { createJWTAuthService } from "./infrastructure/auth/jwt.service.js";
import {
  createAuthMiddleware,
  createRoleMiddleware,
} from "./api/middleware/auth.middleware.js";

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

    console.warn("Initializing repositories...");
    const userRepository = createUserRepository();
    const courseRepository = createCourseRepository();
    const enrollmentRepository = createEnrollmentRepository();
    const reviewRepository = createReviewRepository();

    console.warn("Initializing services...");
    const authService = createJWTAuthService();

    console.warn("Creating middleware...");
    const authenticate = createAuthMiddleware(userRepository, authService);
    const authorizeInstructor = createRoleMiddleware("INSTRUCTOR");

    console.warn("Creating routes...");
    const authRoutes = createAuthRoutes(userRepository, authService);
    const courseRoutes = createCourseRoutes({
      courseRepository,
      authenticate,
      authorizeInstructor,
    });
    const enrollmentRoutes = createEnrollmentRoutes({
      enrollmentRepository,
      authenticate,
    });
    const reviewRoutes = createReviewRoutes({
      reviewRepository,
      enrollmentRepository,
      authenticate,
    });

    console.warn("Starting Express server...");
    const app = createServer({
      authRoutes,
      courseRoutes,
      enrollmentRoutes,
      reviewRoutes,
    });

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
