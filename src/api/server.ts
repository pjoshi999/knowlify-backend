import express, { Express, Request, Response, Router } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";

import { config } from "../shared/config.js";
import { errorHandler } from "./middleware/error.middleware.js";

interface ServerConfig {
  authRoutes: Router;
  courseRoutes: Router;
  enrollmentRoutes: Router;
  reviewRoutes: Router;
}

export const createServer = ({
  authRoutes,
  courseRoutes,
  enrollmentRoutes,
  reviewRoutes,
}: ServerConfig): Express => {
  const app = express();

  app.use(helmet());

  app.use(
    cors({
      origin: config.cors.origin,
      credentials: config.cors.credentials,
    })
  );

  app.use(compression());

  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  if (config.server.nodeEnv !== "test") {
    app.use(morgan("combined"));
  }

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "healthy", timestamp: new Date().toISOString() });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/courses", courseRoutes);
  app.use("/api/enrollments", enrollmentRoutes);
  app.use("/api/reviews", reviewRoutes);

  app.use(errorHandler);

  return app;
};
