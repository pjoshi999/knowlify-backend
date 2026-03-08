import { Request, Response, NextFunction } from "express";
import { Pool } from "pg";
import { logger } from "../logger";

export interface AuditLogEntry {
  sessionId?: string;
  instructorId: string;
  action: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

export class AuditLogger {
  constructor(private pool: Pool) {}

  async log(entry: AuditLogEntry): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO upload_audit_logs (
          session_id, instructor_id, action, details, ip_address, user_agent, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [
          entry.sessionId || null,
          entry.instructorId,
          entry.action,
          entry.details ? JSON.stringify(entry.details) : null,
          entry.ipAddress || null,
          entry.userAgent || null,
        ]
      );
    } catch (error) {
      logger.error({ message: "Failed to write audit log", error, entry });
      // Don't throw - audit logging should not break the main flow
    }
  }

  middleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
      // Only audit upload-related endpoints
      if (!req.path.includes("/uploads")) {
        return next();
      }

      const userId = (req as any).user?.id;
      if (!userId) {
        return next();
      }

      const sessionId = req.params["sessionId"] as string | undefined;
      const action = this.getActionFromRequest(req);
      const ipAddress = this.getClientIp(req);
      const userAgent = req.headers["user-agent"];

      // Log after response is sent
      res.on("finish", () => {
        this.log({
          sessionId,
          instructorId: userId,
          action,
          details: {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            query: req.query,
          },
          ipAddress,
          userAgent,
        }).catch((error) => {
          logger.error({ message: "Audit log failed", error });
        });
      });

      next();
    };
  }

  private getActionFromRequest(req: Request): string {
    const method = req.method;
    const path = req.path;

    if (method === "POST" && path.includes("/initiate")) {
      return "upload_initiated";
    }
    if (method === "POST" && path.includes("/chunks/")) {
      return "chunk_uploaded";
    }
    if (method === "GET" && path.includes("/progress")) {
      return "progress_checked";
    }
    if (method === "POST" && path.includes("/refresh-url")) {
      return "url_refreshed";
    }
    if (method === "DELETE") {
      return "upload_cancelled";
    }
    if (method === "GET" && path === "/api/uploads") {
      return "uploads_listed";
    }

    return `${method.toLowerCase()}_${path.split("/").pop()}`;
  }

  private getClientIp(req: Request): string {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string") {
      return forwarded.split(",")[0]?.trim() || "unknown";
    }
    return req.socket.remoteAddress || "unknown";
  }
}
