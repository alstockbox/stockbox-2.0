import { describe, expect, it, vi } from "vitest";
import { getBillingReadiness, reportBillingReadiness, SUBSCRIPTIONS_UNAVAILABLE_MESSAGE } from "../../src/lib/billing/readiness";
import { parseServerEnv } from "../../src/lib/env/server";

const stripeCatalog = {
  STRIPE_PRICE_BASIC_MONTHLY: "price_basic",
  STRIPE_COUPON_BASIC_LAUNCH: "coupon_basic",
  STRIPE_PRICE_STANDARD_MONTHLY: "price_standard",
  STRIPE_COUPON_STANDARD_LAUNCH: "coupon_standard",
  STRIPE_PRICE_PREMIUM_MONTHLY: "price_pro",
  STRIPE_COUPON_PREMIUM_LAUNCH: "coupon_pro",
  STRIPE_PRICE_ELITE_MONTHLY: "price_elite",
};

function readyEnv(overrides: Record<string, string | undefined> = {}) {
  return parseServerEnv({
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    STRIPE_RESTRICTED_KEY: "rk_test_checkout",
    ...stripeCatalog,
    ...overrides,
  });
}

describe("billing readiness", () => {
  it("is ready with the complete paid-plan catalog and no webhook secret", () => {
    const readiness = getBillingReadiness(readyEnv());
    expect(readiness.checkoutReady).toBe(true);
    expect(readiness.paidCatalogReady).toBe(true);
    expect(readiness.missingVariables).toEqual([]);
  });

  it("reports missing names and booleans without exposing values", () => {
    const readiness = getBillingReadiness(readyEnv({ STRIPE_COUPON_BASIC_LAUNCH: "" }));
    const logger = vi.fn();
    reportBillingReadiness(readiness, logger);
    expect(readiness).toMatchObject({
      checkoutReady: false,
      supabaseConfigured: true,
      restrictedKeyPresent: true,
      basicPricePresent: true,
      launchCouponPresent: false,
      paidCatalogReady: false,
      missingVariables: ["STRIPE_COUPON_BASIC_LAUNCH"],
    });
    const serializedLog = JSON.stringify(logger.mock.calls);
    expect(serializedLog).toContain("STRIPE_COUPON_BASIC_LAUNCH");
    expect(serializedLog).not.toContain("rk_test_checkout");
    expect(serializedLog).not.toContain("sb_publishable_test");
    expect(serializedLog).not.toContain("price_basic");
  });

  it("requires every paid-plan price and launch coupon that should exist", () => {
    const missingStandard = getBillingReadiness(readyEnv({ STRIPE_PRICE_STANDARD_MONTHLY: "" }));
    expect(missingStandard.checkoutReady).toBe(false);
    expect(missingStandard.missingVariables).toEqual(["STRIPE_PRICE_STANDARD_MONTHLY"]);
  });

  it("uses customer-safe unavailable wording", () => {
    expect(SUBSCRIPTIONS_UNAVAILABLE_MESSAGE).not.toMatch(/supabase|stripe|environment|webhook|api key|configuration/i);
  });
});