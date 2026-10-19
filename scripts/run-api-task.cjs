const { existsSync } = require("node:fs");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
for (const file of [".env.local", ".env"]) {
  const path = resolve(root, file);
  if (existsSync(path)) process.loadEnvFile(path);
}

const task = process.argv[2];
if (!["prisma:generate", "prisma:migrate", "prisma:seed"].includes(task)) {
  throw new Error("Unknown API task");
}
const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", task, "-w", "@ism/api"], { cwd: root, env: process.env, stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
