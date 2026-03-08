import { logger } from "../../shared/logger";
import axios from "axios";
import crypto from "crypto";

interface NotificationChannel {
  type: "email" | "in-app" | "webhook";
  enabled: boolean;
  config?: Record<string, any>;
}

interface NotificationPayload {
  userId: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, any>;
  channels: NotificationChannel[];
}

interface TranscodingCompletionData {
  sessionId: string;
  courseId: string;
  fileName: string;
  duration: number;
  qualityProfiles: string[];
  outputs: Array<{
    profile: string;
    url: string;
    size: number;
  }>;
}

interface TranscodingFailureData {
  sessionId: string;
  courseId: string;
  fileName: string;
  error: string;
  retryCount: number;
}

export class NotificationService {
  private emailServiceUrl: string;
  private webhookTimeout: number = 10000; // 10 seconds

  constructor() {
    this.emailServiceUrl = process.env["EMAIL_SERVICE_URL"] || "";
  }

  async sendNotification(payload: NotificationPayload): Promise<void> {
    const { userId, type, title, message, data, channels } = payload;

    logger.info({
      message: "Sending notification",
      userId,
      type,
      channels: channels.map((c) => c.type),
    });

    const promises = channels
      .filter((channel) => channel.enabled)
      .map((channel) => {
        switch (channel.type) {
          case "email":
            return this.sendEmail(userId, title, message, data);
          case "in-app":
            return this.sendInAppNotification(
              userId,
              type,
              title,
              message,
              data
            );
          case "webhook":
            return this.sendWebhook(
              userId,
              type,
              title,
              message,
              data,
              channel.config
            );
          default:
            return Promise.resolve();
        }
      });

    try {
      await Promise.allSettled(promises);
    } catch (error) {
      logger.error({ message: "Failed to send notifications", error, payload });
    }
  }

  async sendTranscodingCompletion(
    userId: string,
    data: TranscodingCompletionData,
    channels: NotificationChannel[]
  ): Promise<void> {
    const durationMinutes = Math.round(data.duration / 60);
    const profilesList = data.qualityProfiles.join(", ");

    await this.sendNotification({
      userId,
      type: "transcoding_completed",
      title: "Video Transcoding Completed",
      message: `Your video "${data.fileName}" has been successfully transcoded in ${durationMinutes} minutes. Quality profiles: ${profilesList}`,
      data: {
        sessionId: data.sessionId,
        courseId: data.courseId,
        fileName: data.fileName,
        duration: data.duration,
        qualityProfiles: data.qualityProfiles,
        outputs: data.outputs,
      },
      channels,
    });
  }

  async sendTranscodingFailure(
    userId: string,
    data: TranscodingFailureData,
    channels: NotificationChannel[]
  ): Promise<void> {
    const retryMessage =
      data.retryCount > 0 ? ` This was retry attempt ${data.retryCount}.` : "";

    await this.sendNotification({
      userId,
      type: "transcoding_failed",
      title: "Video Transcoding Failed",
      message: `Your video "${data.fileName}" failed to transcode. Error: ${data.error}.${retryMessage} Please contact support if this issue persists.`,
      data: {
        sessionId: data.sessionId,
        courseId: data.courseId,
        fileName: data.fileName,
        error: data.error,
        retryCount: data.retryCount,
      },
      channels,
    });
  }

  private async sendEmail(
    userId: string,
    title: string,
    message: string,
    data?: Record<string, any>
  ): Promise<void> {
    if (!this.emailServiceUrl) {
      logger.warn(
        "Email service URL not configured, skipping email notification"
      );
      return;
    }

    try {
      await axios.post(
        `${this.emailServiceUrl}/send`,
        {
          userId,
          subject: title,
          body: message,
          data,
        },
        {
          timeout: this.webhookTimeout,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      logger.info({ message: "Email notification sent", userId, title });
    } catch (error) {
      logger.error({
        message: "Failed to send email notification",
        error,
        userId,
        title,
      });
      throw error;
    }
  }

  private async sendInAppNotification(
    userId: string,
    type: string,
    title: string,
    _message: string,
    _data?: Record<string, any>
  ): Promise<void> {
    // In a real implementation, this would store the notification in the database
    // and potentially push it via WebSocket to connected clients
    logger.info({
      message: "In-app notification created",
      userId,
      type,
      title,
    });

    // Placeholder: Store in database
    // await this.pool.query(
    //   `INSERT INTO notifications (user_id, type, title, message, data, read, created_at)
    //    VALUES ($1, $2, $3, $4, $5, false, NOW())`,
    //   [userId, type, title, message, data ? JSON.stringify(data) : null]
    // );
  }

  private async sendWebhook(
    userId: string,
    type: string,
    title: string,
    message: string,
    data?: Record<string, any>,
    config?: Record<string, any>
  ): Promise<void> {
    if (!config || !config["url"]) {
      logger.warn("Webhook URL not configured, skipping webhook notification");
      return;
    }

    const payload = {
      userId,
      type,
      title,
      message,
      data,
      timestamp: new Date().toISOString(),
    };

    try {
      const response = await axios.post(config["url"], payload, {
        timeout: this.webhookTimeout,
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": this.generateWebhookSignature(
            payload,
            config["secret"]
          ),
          ...(config["headers"] || {}),
        },
      });

      logger.info({
        message: "Webhook notification sent",
        userId,
        type,
        url: config["url"],
        status: response.status,
      });
    } catch (error) {
      logger.error({
        message: "Failed to send webhook notification",
        error,
        userId,
        type,
        url: config["url"],
      });
      throw error;
    }
  }

  private generateWebhookSignature(payload: any, secret?: string): string {
    if (!secret) return "";

    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(JSON.stringify(payload));
    return hmac.digest("hex");
  }
}
