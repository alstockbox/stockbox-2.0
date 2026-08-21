import { describe, expect, it, vi } from "vitest";
import {
  getBillingReadiness,
  reportBillingReadiness,
  SUBSCRIPTIONS_UNAVAILABLE_MESSAGE
} from "../../src/lib/billing/readiness";
import { parseServerEnv } from "../../src/lib/env/server";

describe("billing readiness", () => {
  it("is ready without a Stripe webhook secret", () => {
    const readiness = getBillingReadiness(parseServerEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      STRIPE_RESTRICTED_KEY: "rk_test_checkout",
      STRIPE_PRICE_BASIC_MONTHLY: "price_basic",
      STRIPE_COUPON_BASIC_LAUNCH: "coupon_launch"
    }));

    expect(readiness.checkoutReady).toBe(true);
    expect(readiness.missingVariables).toEqual([]);
  });

  it("reports missing names and booleans without exposing values", () => {
    const env = parseServerEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_must_not_log",
      STRIPE_RESTRICTED_KEY: "rk_live_must_not_log",
      STRIPE_PRICE_BASIC_MONTHLY: "price_must_not_log"
    });
    const readiness = getBillingReadiness(env);
    const logger = vi.fn();

    reportBillingReadiness(readiness, logger);

    expect(readiness).toMatchObject({
      checkoutReady: false,
      supabaseConfigured: true,
      restrictedKeyPresent: true,
      basicPricePresent: true,
      launchCouponPresent: false,
      missingVariables: ["STRIPE_COUPON_BASIC_LAUNCH"]
    });
    const serializedLog = JSON.stringify(logger.mock.calls);
    expect(serializedLog).toContain("STRIPE_COUPON_BASIC_LAUNCH");
    expect(serializedLog).not.toContain("rk_live_must_not_log");
    expect(serializedLog).not.toContain("sb_publishable_must_not_log");
    expect(serializedLog).not.toContain("price_must_not_log");
  });

  it("uses customer-safe unavailable wording", () => {
    expect(SUBSCRIPTIONS_UNAVAILABLE_MESSAGE).not.toMatch(
      /supabase|stripe|environment|webhook|api key|configuration/i
    );
  });
});
