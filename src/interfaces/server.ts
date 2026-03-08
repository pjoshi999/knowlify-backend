import express, {
  Express,
  NextFunction,
  Request,
  Response,
  Router,
} from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import pinoHttp from "pino-http";
import { config } from "../shared/config.js";
import { logger } from "../shared/logger.js";
import { errorHandler } from "./middleware/error.middleware.js";
import { publicRateLimiter } from "./middleware/rate-limit.middleware.js";

interface ServerConfig {
  authRoutes: Router;
  courseRoutes: Router;
  enrollmentRoutes: Router;
  reviewRoutes: Router;
  paymentRoutes: Router;
  uploadRoutes: Router;
  instructorRoutes: Router;
  searchRoutes: Router;
  chatRoutes: Router;
  videoUploadRoutes: Router;
  analyticsRoutes: Router;
  healthRoutes: Router;
  metricsRouter: Router;
  isDatabaseReady: () => boolean;
}

export const createServer = ({
  authRoutes,
  courseRoutes,
  enrollmentRoutes,
  reviewRoutes,
  paymentRoutes,
  uploadRoutes,
  instructorRoutes,
  searchRoutes,
  chatRoutes,
  videoUploadRoutes,
  analyticsRoutes,
  healthRoutes,
  metricsRouter,
  isDatabaseReady,
}: ServerConfig): Express => {
  const app = express();
  app.set("trust proxy", 1);

  app.use(helmet());

  app.use(
    cors({
      origin: config.cors.origin,
      credentials: config.cors.credentials,
    })
  );

  app.use(compression());

  // Apply rate limiting to all routes
  app.use(publicRateLimiter);

  app.use("/api/payments/webhook", express.raw({ type: "application/json" }));

  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  if (config.server.nodeEnv !== "test") {
    app.use(
      pinoHttp({
        logger,
        autoLogging: {
          ignore: (req) => (req as Request).path === "/health",
        },
        customLogLevel: (_req, res, err) => {
          if (res.statusCode >= 500 || err) return "error";
          if (res.statusCode >= 400) return "warn";
          return "info";
        },
        customSuccessMessage: (req, res) => {
          return `${(req as Request).method} ${(req as Request).originalUrl} ${res.statusCode}`;
        },
        customErrorMessage: (req, _res, err) => {
          return `${(req as Request).method} ${(req as Request).originalUrl} failed: ${err.message}`;
        },
        serializers: {
          req: (req: Request) => ({
            method: req.method,
            url: req.url,
            query: req.query,
            params: req.params,
          }),
          res: (res: Response) => ({
            statusCode: res.statusCode,
          }),
        },
      })
    );
  }

  app.get("/health", (_req: Request, res: Response) => {
    const dbReady = isDatabaseReady();
    res.status(dbReady ? 200 : 503).json({
      status: dbReady ? "healthy" : "starting",
      db: dbReady ? "connected" : "connecting",
      timestamp: new Date().toISOString(),
    });
  });

  app.use("/api", (_req: Request, res: Response, next: NextFunction): void => {
    if (!isDatabaseReady()) {
      res.status(503).json({
        error: "Service Unavailable",
        message: "Database is starting up — please retry in a few seconds",
        retryAfter: 5,
      });
      return;
    }
    next();
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/courses", courseRoutes);
  app.use("/api/enrollments", enrollmentRoutes);
  app.use("/api/reviews", reviewRoutes);
  app.use("/api/payments", paymentRoutes);
  app.use("/api/uploads", uploadRoutes);
  app.use("/api/instructor", instructorRoutes);
  app.use("/api/search", searchRoutes);
  app.use("/api/chat", chatRoutes);
  app.use("/api/video-uploads", videoUploadRoutes);
  app.use("/api/analytics", analyticsRoutes);
  app.use("/", healthRoutes);
  app.use("/", metricsRouter);

  app.use(errorHandler);

  return app;
};
