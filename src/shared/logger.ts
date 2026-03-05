import pino from "pino";

const isProduction = process.env["NODE_ENV"] === "production";
const isTest = process.env["NODE_ENV"] === "test";

export const logger = pino({
  level: process.env["LOG_LEVEL"] ?? (isProduction ? "info" : "debug"),

  ...(isTest && { level: "silent" }),

  formatters: {
    level(label) {
      return { level: label };
    },
  },

  redact: {
    paths: [
      "password",
      "req.headers.authorization",
      "req.headers.cookie",
      "*.password",
      "*.token",
      "*.accessToken",
      "*.refreshToken",
      "*.secret",
    ],
    censor: "[REDACTED]",
  },

  timestamp: pino.stdTimeFunctions.isoTime,

  ...(!isProduction &&
    !isTest && {
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:HH:MM:ss.l",
          ignore: "pid,hostname",
          singleLine: false,
        },
      },
    }),
});

export const createModuleLogger = (module: string): pino.Logger =>
  logger.child({ module });
