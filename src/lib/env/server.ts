import { z } from "zod";

export const DEFAULT_POSTHOG_HOST = "https://app.posthog.com";

const envSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SITE_NAME: z.string().default("StockBox"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional().or(z.literal("")),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().optional().or(z.literal("")),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().or(z.literal("")),
  STRIPE_RESTRICTED_KEY: z.string().optional().or(z.literal("")),
  STRIPE_WEBHOOK_SECRET: z.string().optional().or(z.literal("")),
  STRIPE_PRICE_BASIC_MONTHLY: z.string().optional().or(z.literal("")),
  STRIPE_COUPON_BASIC_LAUNCH: z.string().optional().or(z.literal("")),
  STRIPE_PRICE_STANDARD_MONTHLY: z.string().optional().or(z.literal("")),
  STRIPE_PRICE_PREMIUM_MONTHLY: z.string().optional().or(z.literal("")),
  STRIPE_PRICE_ELITE_MONTHLY: z.string().optional().or(z.literal("")),
  SEC_USER_AGENT: z.string().optional().or(z.literal("")),
  MARKET_DATA_PROVIDER: z.string().default("stooq"),
  NEWS_PROVIDER: z.string().default("disabled"),
  NEWS_API_KEY: z.string().optional().or(z.literal("")),
  AI_PROVIDER: z.string().default("disabled"),
  AI_PROVIDER_API_KEY: z.string().optional().or(z.literal("")),
  AI_MODEL_SUMMARY: z.string().optional().or(z.literal("")),
  EMAIL_PROVIDER: z.string().default("disabled"),
  RESEND_API_KEY: z.string().optional().or(z.literal("")),
  ADMIN_ALERT_EMAIL: z.string().email().optional().or(z.literal("")),
  FROM_EMAIL: z.string().email().optional().or(z.literal("")),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional().or(z.literal("")),
  NEXT_PUBLIC_POSTHOG_HOST: z
    .string()
    .trim()
    .url()
    .default(DEFAULT_POSTHOG_HOST)
    .catch(DEFAULT_POSTHOG_HOST),
  ADMIN_EMAILS: z.string().optional().or(z.literal(""))
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
  return Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

export function isStripeConfigured() {
  const env = getServerEnv();
  return Boolean(env.STRIPE_RESTRICTED_KEY && env.STRIPE_WEBHOOK_SECRET);
}

export function isBasicLaunchCheckoutConfigured() {
  const env = getServerEnv();
  return Boolean(
    isStripeConfigured() &&
      env.STRIPE_PRICE_BASIC_MONTHLY &&
      env.STRIPE_COUPON_BASIC_LAUNCH
  );
}

export function isFinancialProviderConfigured() {
  const env = getServerEnv();
  return Boolean(env.SEC_USER_AGENT);
}

export function adminEmails() {
  return (getServerEnv().ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}
