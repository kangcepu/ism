const path = require("node:path");

const root = __dirname;

module.exports = {
  apps: [
    {
      name: "ism-api",
      cwd: root,
      script: path.join(root, "apps", "api", "dist", "src", "main.js"),
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: 8001,
        COOKIE_SECURE: "false",
      },
      time: true,
      merge_logs: true,
      out_file: path.join(root, "logs", "api-out.log"),
      error_file: path.join(root, "logs", "api-error.log"),
    },
    {
      name: "ism-web",
      cwd: path.join(root, "apps", "web"),
      script: path.join(root, "node_modules", "next", "dist", "bin", "next"),
      args: "start -p 3000",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        API_ORIGIN: "http://localhost:8001",
      },
      time: true,
      merge_logs: true,
      out_file: path.join(root, "logs", "web-out.log"),
      error_file: path.join(root, "logs", "web-error.log"),
    },
  ],
};
