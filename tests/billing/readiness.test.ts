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

const legalCatalog = {
  LEGAL_BUSINESS_NAME: "Example Sole Trader",
  LEGAL_ORGANIZATION_NUMBER: "000000-0000",
  LEGAL_POSTAL_ADDRESS: "Example street 1, 111 11 Stockholm, Sweden",
  LEGAL_SUPPORT_EMAIL: "support@example.com",
  LEGAL_SUPPORT_PHONE: "+46123456789",
  LEGAL_VAT_MODE: "small_business_exempt",
};

function readyEnv(overrides: Record<string, string | undefined> = {}) {
  return parseServerEnv({
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    STRIPE_RESTRICTED_KEY: "rk_test_checkout",
    ...stripeCatalog,
    ...legalCatalog,
    ...overrides,
  });
}

describe("billing readiness", () => {
  it("is ready with the complete paid-plan catalog and no webhook secret", () => {
    const readiness = getBillingReadiness(readyEnv());
    expect(readiness.checkoutReady).toBe(true);
    expect(readiness.paidCatalogReady).toBe(true);
    expect(readiness.legalCommerceReady).toBe(true);
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
      legalCommerceReady: true,
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

  it("blocks paid checkout until seller identity and VAT mode are configured", () => {
    const readiness = getBillingReadiness(readyEnv({
      LEGAL_BUSINESS_NAME: "",
      LEGAL_ORGANIZATION_NUMBER: "",
      LEGAL_POSTAL_ADDRESS: "",
      LEGAL_SUPPORT_EMAIL: "",
      LEGAL_SUPPORT_PHONE: "",
      LEGAL_VAT_MODE: "",
    }));

    expect(readiness.checkoutReady).toBe(false);
    expect(readiness.paidCatalogReady).toBe(true);
    expect(readiness.legalCommerceReady).toBe(false);
    expect(readiness.missingVariables).toEqual(expect.arrayContaining([
      "LEGAL_BUSINESS_NAME",
      "LEGAL_ORGANIZATION_NUMBER",
      "LEGAL_POSTAL_ADDRESS",
      "LEGAL_SUPPORT_EMAIL",
      "LEGAL_SUPPORT_PHONE",
      "LEGAL_VAT_MODE"
    ]));
  });

  it("requires a VAT number when the seller is VAT registered", () => {
    const readiness = getBillingReadiness(readyEnv({
      LEGAL_VAT_MODE: "vat_registered",
      LEGAL_VAT_NUMBER: "",
    }));

    expect(readiness.checkoutReady).toBe(false);
    expect(readiness.paidCatalogReady).toBe(true);
    expect(readiness.legalCommerceReady).toBe(false);
    expect(readiness.missingVariables).toContain("LEGAL_VAT_NUMBER");
  });

  it("uses customer-safe unavailable wording", () => {
    expect(SUBSCRIPTIONS_UNAVAILABLE_MESSAGE).not.toMatch(/supabase|stripe|environment|webhook|api key|configuration/i);
  });
});
