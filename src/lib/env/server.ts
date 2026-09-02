import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SITE_NAME: z.string().default("StockBox 2.0"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional().or(z.literal("")),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().or(z.literal("")),
  SUPABASE_STORAGE_BUCKET: z.string().default("stockbox-assets"),
  SINGLE_USER_EMAIL: z.string().email().optional().or(z.literal("")),
  SINGLE_USER_PASSWORD_HASH: z.string().optional().or(z.literal("")),
  SESSION_SECRET: z.string().min(32).optional().or(z.literal(""))
});

export type ServerEnv = z.infer<typeof envSchema>;

let cachedEnv: ServerEnv | null = null;

export function parseServerEnv(env: Record<string, string | undefined>) {
  return envSchema.parse(env);
}

export function getServerEnv() {
  cachedEnv ??= parseServerEnv(process.env);
  return cachedEnv;
}

export function isSupabaseConfigured() {
  const env = getServerEnv();
  return Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

export function assertConfigured() {
  const env = getServerEnv();
  const missing = [
    ["NEXT_PUBLIC_SUPABASE_URL", env.NEXT_PUBLIC_SUPABASE_URL],
    ["SUPABASE_SERVICE_ROLE_KEY", env.SUPABASE_SERVICE_ROLE_KEY],
    ["SINGLE_USER_EMAIL", env.SINGLE_USER_EMAIL],
    ["SINGLE_USER_PASSWORD_HASH", env.SINGLE_USER_PASSWORD_HASH],
    ["SESSION_SECRET", env.SESSION_SECRET]
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Saknar miljövariabler: ${missing.join(", ")}`);
  }

  return env;
}
