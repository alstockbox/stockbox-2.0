import { getServerEnv, type ServerEnv } from "@/lib/env/server";
import { getLegalCommerceReadiness, type LegalCommerceVariable } from "@/lib/legal/commerce";

export const SUBSCRIPTIONS_UNAVAILABLE_MESSAGE =
  "Checkout could not start. Please try again or contact support if the problem continues.";

export type BillingEnvironmentVariable =
  | "NEXT_PUBLIC_SUPABASE_URL"
  | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
  | "SUPABASE_SERVICE_ROLE_KEY"
  | "STRIPE_RESTRICTED_KEY"
  | "STRIPE_PRICE_BASIC_MONTHLY"
  | "STRIPE_COUPON_BASIC_LAUNCH"
  | "STRIPE_PRICE_STANDARD_MONTHLY"
  | "STRIPE_COUPON_STANDARD_LAUNCH"
  | "STRIPE_PRICE_PREMIUM_MONTHLY"
  | "STRIPE_COUPON_PREMIUM_LAUNCH"
  | "STRIPE_PRICE_ELITE_MONTHLY"
  | "STRIPE_COUPON_AFFILIATE_10"
  | "EMAIL_PROVIDER"
  | "RESEND_API_KEY"
  | "FROM_EMAIL"
  | LegalCommerceVariable;

export type BillingReadiness = {
  checkoutReady: boolean;
  supabaseConfigured: boolean;
  serviceRolePresent: boolean;
  restrictedKeyPresent: boolean;
  basicPricePresent: boolean;
  launchCouponPresent: boolean;
  paidCatalogReady: boolean;
  legalCommerceReady: boolean;
  withdrawalReceiptReady: boolean;
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
  "STRIPE_COUPON_AFFILIATE_10",
];

export function getBillingReadiness(env: ServerEnv = getServerEnv()): BillingReadiness {
  const supabaseUrlPresent = Boolean(env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseKeyPresent = Boolean(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const serviceRolePresent = Boolean(env.SUPABASE_SERVICE_ROLE_KEY);
  const restrictedKeyPresent = Boolean(env.STRIPE_RESTRICTED_KEY);
  const legalReadiness = getLegalCommerceReadiness(env);
  const withdrawalReceiptReady = env.EMAIL_PROVIDER === "resend" && Boolean(env.RESEND_API_KEY) && Boolean(env.FROM_EMAIL);
  const missingVariables: BillingEnvironmentVariable[] = [];

  if (!supabaseUrlPresent) missingVariables.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!supabaseKeyPresent) missingVariables.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  if (!serviceRolePresent) missingVariables.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!restrictedKeyPresent) missingVariables.push("STRIPE_RESTRICTED_KEY");
  if (env.EMAIL_PROVIDER !== "resend") missingVariables.push("EMAIL_PROVIDER");
  if (!env.RESEND_API_KEY) missingVariables.push("RESEND_API_KEY");
  if (!env.FROM_EMAIL) missingVariables.push("FROM_EMAIL");
  for (const variable of requiredStripeCatalog) {
    if (!env[variable]) missingVariables.push(variable);
  }
  missingVariables.push(...legalReadiness.missingVariables);

  const paidCatalogReady = requiredStripeCatalog.every((variable) => Boolean(env[variable]));

  return {
    checkoutReady: missingVariables.length === 0,
    supabaseConfigured: supabaseUrlPresent && supabaseKeyPresent,
    serviceRolePresent,
    restrictedKeyPresent,
    basicPricePresent: Boolean(env.STRIPE_PRICE_BASIC_MONTHLY),
    launchCouponPresent: Boolean(env.STRIPE_COUPON_BASIC_LAUNCH),
    paidCatalogReady,
    legalCommerceReady: legalReadiness.ready,
    withdrawalReceiptReady,
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
    serviceRolePresent: readiness.serviceRolePresent,
    restrictedKeyPresent: readiness.restrictedKeyPresent,
    basicPricePresent: readiness.basicPricePresent,
    launchCouponPresent: readiness.launchCouponPresent,
    paidCatalogReady: readiness.paidCatalogReady,
    legalCommerceReady: readiness.legalCommerceReady,
    withdrawalReceiptReady: readiness.withdrawalReceiptReady,
    missingVariables: readiness.missingVariables,
  });
}
