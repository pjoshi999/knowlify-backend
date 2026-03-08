/**
 * PM2 Ecosystem Configuration
 *
 * Run with: pm2 start ecosystem.config.cjs
 */

module.exports = {
  apps: [
    {
      name: "knowlify-api",
      script: "tsx",
      args: "src/index.ts",
      instances: 1, // Run 2 instances for load balancing
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
        PORT: 8080,
      },
      error_file: "./logs/api-error.log",
      out_file: "./logs/api-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      max_memory_restart: "1G",
    },
    {
      name: "knowlify-worker",
      script: "tsx",
      args: "src/workers/video-analysis.worker.ts",
      instances: 1, // Run 3 worker instances
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
        WORKER_TYPE: "video-analysis",
      },
      error_file: "./logs/worker-error.log",
      out_file: "./logs/worker-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      max_memory_restart: "1G",
      cron_restart: "0 3 * * *", // Restart daily at 3 AM
    },
  ],
};
