import { z } from "zod";
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8001),
  DATABASE_URL: z.string().startsWith("postgresql://"),
  COOKIE_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().min(32),
  CSRF_SECRET: z.string().min(32),
  CORS_ORIGINS: z.string().min(1),
});
export function validateEnvironment(config: Record<string, unknown>) { return { ...config, ...schema.parse(config) }; }
