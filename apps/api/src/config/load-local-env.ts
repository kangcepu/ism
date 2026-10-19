import { existsSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

const cwd = process.cwd();
const root =
  basename(cwd) === "api" && basename(dirname(cwd)) === "apps"
    ? resolve(cwd, "../..")
    : cwd;
const localEnv = resolve(root, ".env.local");
if (existsSync(localEnv)) process.loadEnvFile(localEnv);
