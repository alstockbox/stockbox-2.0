import { getServerEnv, type ServerEnv } from "@/lib/env/server";

export const SUBSCRIPTIONS_UNAVAILABLE_MESSAGE =
  "Subscriptions are temporarily unavailable. Please try again shortly.";

export type BillingEnvironmentVariable =
  | "NEXT_PUBLIC_SUPABASE_URL"
  | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
  | "STRIPE_RESTRICTED_KEY"
  | "STRIPE_PRICE_BASIC_MONTHLY"
  | "STRIPE_COUPON_BASIC_LAUNCH";

export type BillingReadiness = {
  checkoutReady: boolean;
  supabaseConfigured: boolean;
  restrictedKeyPresent: boolean;
  basicPricePresent: boolean;
  launchCouponPresent: boolean;
  missingVariables: BillingEnvironmentVariable[];
};

export function getBillingReadiness(env: ServerEnv = getServerEnv()): BillingReadiness {
  const supabaseUrlPresent = Boolean(env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseKeyPresent = Boolean(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const restrictedKeyPresent = Boolean(env.STRIPE_RESTRICTED_KEY);
  const basicPricePresent = Boolean(env.STRIPE_PRICE_BASIC_MONTHLY);
  const launchCouponPresent = Boolean(env.STRIPE_COUPON_BASIC_LAUNCH);
  const missingVariables: BillingEnvironmentVariable[] = [];

  if (!supabaseUrlPresent) missingVariables.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!supabaseKeyPresent) missingVariables.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  if (!restrictedKeyPresent) missingVariables.push("STRIPE_RESTRICTED_KEY");
  if (!basicPricePresent) missingVariables.push("STRIPE_PRICE_BASIC_MONTHLY");
  if (!launchCouponPresent) missingVariables.push("STRIPE_COUPON_BASIC_LAUNCH");

  return {
    checkoutReady: missingVariables.length === 0,
    supabaseConfigured: supabaseUrlPresent && supabaseKeyPresent,
    restrictedKeyPresent,
    basicPricePresent,
    launchCouponPresent,
    missingVariables
  };
}

export function reportBillingReadiness(
  readiness: BillingReadiness,
  logger: (message: string, context: Record<string, unknown>) => void = console.warn
) {
  if (readiness.checkoutReady) return;

  logger("[billing] Checkout is not ready.", {
    checkoutReady: false,
    supabaseConfigured: readiness.supabaseConfigured,
    restrictedKeyPresent: readiness.restrictedKeyPresent,
    basicPricePresent: readiness.basicPricePresent,
    launchCouponPresent: readiness.launchCouponPresent,
    missingVariables: readiness.missingVariables
  });
}
