import type { ServerEnv } from "@/lib/env/server";
import { getServerEnv } from "@/lib/env/server";

export const SUBSCRIPTIONS_UNAVAILABLE_MESSAGE =
  "Subscriptions are temporarily unavailable. Please try again shortly.";

export type BillingEnvironmentVariable =
  | "NEXT_PUBLIC_SUPABASE_URL"
  | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
  | "STRIPE_RESTRICTED_KEY"
  | "STRIPE_PRICE_BASIC_MONTHLY"
  | "STRIPE_COUPON_BASIC_LAUNCH"
  | "STRIPE_PRICE_STANDARD_MONTHLY"
  | "STRIPE_COUPON_STANDARD_LAUNCH"
  | "STRIPE_PRICE_PREMIUM_MONTHLY"
  | "STRIPE_COUPON_PREMIUM_LAUNCH"
  | "STRIPE_PRICE_ELITE_MONTHLY";

export type BillingReadiness = {
  checkoutReady: boolean;
  supabaseConfigured: boolean;
  restrictedKeyPresent: boolean;
  basicPricePresent: boolean;
  launchCouponPresent: boolean;
  paidCatalogReady: boolean;
  missingVariables: BillingEnvironmentVariable[];
};

const requiredStripeCatalog: BillingEnvironmentVariable[] = [
  "STRIPE_PRICE_BASIC_MONTHLY",
  "STRIPE_COUPON_BASIC_LAUNCH",
  "STRIPE_PRICE_STANDARD_MONTHLY",
  "STRIPE_COUPON_STANDARD_LAUNCH",
  "STRIPE_PRICE_PREMIUM_MONTHLY",
  "STRIPE_COUPON_PREMIUM_LAUNCH",
  "STRIPE_PRICE_ELITE_MONTHLY",
];

export function getBillingReadiness(env: ServerEnv = getServerEnv()): BillingReadiness {
  const supabaseUrlPresent = Boolean(env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseKeyPresent = Boolean(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const restrictedKeyPresent = Boolean(env.STRIPE_RESTRICTED_KEY);
  const missingVariables: BillingEnvironmentVariable[] = [];
  if (!supabaseUrlPresent) missingVariables.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!supabaseKeyPresent) missingVariables.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  if (!restrictedKeyPresent) missingVariables.push("STRIPE_RESTRICTED_KEY");
  for (const variable of requiredStripeCatalog) {
    if (!env[variable]) missingVariables.push(variable);
  }
  const paidCatalogReady = requiredStripeCatalog.every((variable) => Boolean(env[variable]));
  return {
    checkoutReady: missingVariables.length === 0,
    supabaseConfigured: supabaseUrlPresent && supabaseKeyPresent,
    restrictedKeyPresent,
    basicPricePresent: Boolean(env.STRIPE_PRICE_BASIC_MONTHLY),
    launchCouponPresent: Boolean(env.STRIPE_COUPON_BASIC_LAUNCH),
    paidCatalogReady,
    missingVariables,
  };
}

export function reportBillingReadiness(
  readiness: BillingReadiness,
  logger: (message: string, context: Record<string, unknown>) => void = console.warn,
) {
  if (readiness.checkoutReady) return;
  logger("[billing] Checkout is not ready.", {
    checkoutReady: false,
    supabaseConfigured: readiness.supabaseConfigured,
    restrictedKeyPresent: readiness.restrictedKeyPresent,
    paidCatalogReady: readiness.paidCatalogReady,
    missingVariables: readiness.missingVariables,
  });
}