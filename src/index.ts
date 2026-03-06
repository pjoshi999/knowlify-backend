import dns from "node:dns";
import { URL } from "node:url";
import { RequestHandler } from "express";
import { config, validateConfig } from "./shared/config.js";
import { createModuleLogger } from "./shared/logger.js";
import {
  createDatabasePool,
  isDatabaseReady,
} from "./infrastructure/database/pool.js";
import { createRedisClient } from "./infrastructure/cache/redis.js";
import { initializeRateLimiters } from "./interfaces/middleware/rate-limit.middleware.js";
import { createServer } from "./interfaces/server.js";
import { createAuthRoutes } from "./interfaces/routes/auth.routes.js";
import { createCourseRoutes } from "./interfaces/routes/course.routes.js";
import { createEnrollmentRoutes } from "./interfaces/routes/enrollment.routes.js";
import { createReviewRoutes } from "./interfaces/routes/review.routes.js";
import { createPaymentRoutes } from "./interfaces/routes/payment.routes.js";
import { createUploadRoutes } from "./interfaces/routes/upload.routes.js";
import { createInstructorRoutes } from "./interfaces/routes/instructor.routes.js";
import { createSearchRoutes } from "./interfaces/routes/search.routes.js";
import { createUserRepository } from "./infrastructure/repositories/user.repository.js";
import { createCourseRepository } from "./infrastructure/repositories/course.repository.js";
import { createEnrollmentRepository } from "./infrastructure/repositories/enrollment.repository.js";
import { createPaymentRepository } from "./infrastructure/repositories/payment.repository.js";
import { createReviewRepository } from "./infrastructure/repositories/review.repository.js";
import { createJWTAuthService } from "./infrastructure/auth/jwt.service.js";
import { createStripeService } from "./infrastructure/payment/stripe.service.js";
import { createS3Service } from "./infrastructure/storage/s3.service.js";
import { createCacheAdapter } from "./infrastructure/cache/cache.adapter.js";
import { createOpenAIService } from "./infrastructure/ai/openai.service.js";
import { createBullMQAdapter } from "./infrastructure/queue/bullmq.adapter.js";
import { createChatRepository } from "./infrastructure/repositories/chat.repository.js";
import { createChatRoutes } from "./interfaces/routes/chat.routes.js";
import {
  createAuthMiddleware,
  createRoleMiddleware,
} from "./interfaces/middleware/auth.middleware.js";
import { wakeupSupabase } from "./infrastructure/database/db-wakeup.js";
import { startDbKeepaliveScheduler } from "./infrastructure/queue/db-keepalive.worker.js";

const log = createModuleLogger("server");

const configureDnsResolution = (): void => {
  const envOrder = process.env["DNS_RESULT_ORDER"];
  const desiredOrder =
    envOrder ??
    (config.server.nodeEnv === "production" ? "ipv4first" : "verbatim");

  if (desiredOrder === "ipv4first" || desiredOrder === "verbatim") {
    dns.setDefaultResultOrder(desiredOrder);
    log.info(
      { dnsResultOrder: desiredOrder },
      "Configured default DNS result order"
    );
    return;
  }

  log.warn(
    { dnsResultOrder: desiredOrder },
    "Ignoring invalid DNS_RESULT_ORDER; expected ipv4first or verbatim"
  );
};

const shouldForceDatabaseIpv4 = (): boolean => {
  const envValue = process.env["DB_FORCE_IPV4"];
  if (envValue === "true") return true;
  if (envValue === "false") return false;
  return config.server.nodeEnv === "production";
};

const resolveDatabaseConnectionString = async (
  connectionString: string
): Promise<string> => {
  // Supabase PgBouncer pooler requires the exact hostname (SNI) to route tenant
  // connections. If we resolve it to an IPv4 address, it fails with "Tenant or user not found".
  if (
    !shouldForceDatabaseIpv4() ||
    connectionString.includes("pooler.supabase.com")
  ) {
    return connectionString;
  }

  try {
    const parsed = new URL(connectionString);
    const originalHost = parsed.hostname;
    if (!originalHost) return connectionString;

    const resolved = await dns.promises.lookup(originalHost, { family: 4 });
    parsed.hostname = resolved.address;

    log.info(
      {
        dbHost: originalHost,
        dbHostIpv4: resolved.address,
      },
      "Resolved database host to IPv4"
    );

    return parsed.toString();
  } catch (error) {
    log.warn(
      { err: error },
      "Failed to resolve DB host to IPv4; using original connection string"
    );
    return connectionString;
  }
};

const startServer = async (): Promise<void> => {
  try {
    configureDnsResolution();
    validateConfig();

    await wakeupSupabase();
    const dbConnectionString = await resolveDatabaseConnectionString(
      config.database.url
    );

    createDatabasePool({
      connectionString: dbConnectionString,
      max: config.database.poolMax,
    });

    await createRedisClient({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
    });

    initializeRateLimiters();

    const userRepository = createUserRepository();
    const courseRepository = createCourseRepository();
    const enrollmentRepository = createEnrollmentRepository();
    const paymentRepository = createPaymentRepository();
    const reviewRepository = createReviewRepository();
    const chatRepository = createChatRepository(
      (await import("./infrastructure/database/pool.js")).getDatabasePool()
    );

    const authService = createJWTAuthService();
    const stripeService = createStripeService();
    const s3Service = createS3Service();
    const cacheService = createCacheAdapter();
    const aiService = createOpenAIService(config.openai.apiKey);
    const queueService = createBullMQAdapter();

    const authenticate = createAuthMiddleware(userRepository, authService);
    const authorizeInstructor = createRoleMiddleware("INSTRUCTOR");
    const requireRole = (role: string): RequestHandler =>
      createRoleMiddleware(role as "INSTRUCTOR" | "STUDENT" | "ADMIN");

    const authRoutes = createAuthRoutes(
      userRepository,
      authService,
      authenticate
    );
    const courseRoutes = createCourseRoutes({
      courseRepository,
      cache: cacheService,
      authenticate,
      authorizeInstructor,
      enrollmentRepository,
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
    const paymentRoutes = createPaymentRoutes({
      paymentGateway: stripeService,
      paymentRepository,
      enrollmentRepository,
      courseRepository,
      authenticate,
    });
    const uploadRoutes = createUploadRoutes({
      storage: s3Service,
      authenticate,
      requireRole,
    });
    const instructorRoutes = createInstructorRoutes({
      courseRepository,
      cache: cacheService,
      authenticate,
      requireRole,
    });
    const searchRoutes = createSearchRoutes({
      courseRepository,
      cache: cacheService,
    });
    const chatRoutes = createChatRoutes({
      aiService,
      authenticate,
      chatRepository,
      storageService: s3Service,
      courseRepository,
      queueService,
    });

    const app = createServer({
      authRoutes,
      courseRoutes,
      enrollmentRoutes,
      reviewRoutes,
      paymentRoutes,
      uploadRoutes,
      instructorRoutes,
      searchRoutes,
      chatRoutes,
      isDatabaseReady,
    });

    app.listen(config.server.port, config.server.host, () => {
      log.info(
        {
          port: config.server.port,
          host: config.server.host,
          env: config.server.nodeEnv,
        },
        `Server ready at http://${config.server.host}:${config.server.port}`
      );

      startDbKeepaliveScheduler().catch((err: unknown) => {
        log.warn({ err }, "DB keepalive scheduler failed to start (non-fatal)");
      });
    });
  } catch (error) {
    log.fatal({ err: error }, "Failed to start server");
    process.exit(1);
  }
};

const shutdown = (): void => {
  log.info("Shutting down gracefully...");
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

void startServer();
