import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 chars'),
  AUDIT_SIGNING_KEY: z
    .string()
    .min(16, 'AUDIT_SIGNING_KEY must be at least 16 chars'),
  MET_API_BASE_URL: z
    .string()
    .url()
    .default('https://collectionapi.metmuseum.org/public/collection/v1'),
  MET_API_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  PORT: z.coerce.number().int().positive().default(3001),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  SEED_ON_BOOT: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
