/**
 * CryptoX — PM2 Ecosystem Config
 * Usage:
 *   pm2 start deploy/pm2.config.cjs
 *   pm2 save
 *   pm2 startup  (auto-start on reboot)
 */

const APP_DIR = "/opt/cryptox";

module.exports = {
  apps: [
    {
      // ── Node.js API Server ────────────────────────────────────
      name: "cryptox-api",
      script: `${APP_DIR}/artifacts/api-server/dist/index.mjs`,
      interpreter: "node",
      interpreter_args: "--enable-source-maps",
      cwd: APP_DIR,
      instances: 1,           // single instance — Redis leader election manages clustering
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      restart_delay: 3000,
      env: {
        NODE_ENV: "production",
        PORT: "8080",
      },
      env_file: `${APP_DIR}/.env`,
      log_file: "/var/log/cryptox/api.log",
      error_file: "/var/log/cryptox/api-error.log",
      out_file: "/var/log/cryptox/api-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
    },
    {
      // ── Go Order Matching Engine ──────────────────────────────
      name: "cryptox-go",
      script: `${APP_DIR}/artifacts/go-service/server`,
      interpreter: "none",    // binary — no interpreter needed
      cwd: `${APP_DIR}/artifacts/go-service`,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      restart_delay: 2000,
      env: {
        PORT: "23004",
        BASE_PATH: "/go-service/",
        GIN_MODE: "release",
      },
      env_file: `${APP_DIR}/.env`,
      log_file: "/var/log/cryptox/go.log",
      error_file: "/var/log/cryptox/go-error.log",
      out_file: "/var/log/cryptox/go-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
    },
  ],
};
