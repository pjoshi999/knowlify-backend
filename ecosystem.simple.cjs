/**
 * PM2 Simple Configuration (for initial deployment)
 *
 * This starts only the API server with 1 instance.
 * Workers are optional and can be added later.
 *
 * Run with: pm2 start ecosystem.simple.cjs
 */

module.exports = {
  apps: [
    {
      name: "knowlify-api",
      script: "./dist/index.js",
      instances: 1, // Single instance - easy to debug
      exec_mode: "fork", // Fork mode (not cluster)
      env: {
        NODE_ENV: "production",
        PORT: 8080,
      },
      error_file: "./logs/api-error.log",
      out_file: "./logs/api-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      max_memory_restart: "1G",
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 4000,
    },
    // Video Analysis Worker - processes AI-powered video content analysis jobs
    {
      name: "knowlify-worker",
      script: "./dist/workers/video-analysis.worker.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        WORKER_TYPE: "video-analysis",
      },
      error_file: "./logs/worker-error.log",
      out_file: "./logs/worker-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      max_memory_restart: "1G",
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 4000,
    },
  ],
};
