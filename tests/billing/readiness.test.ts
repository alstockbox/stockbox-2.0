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
      STRIPE_COUPON_BASIC_LAUNCH: "coupon_launch",
      LEGAL_BUSINESS_NAME: "Example Sole Trader",
      LEGAL_ORGANIZATION_NUMBER: "000000-0000",
      LEGAL_POSTAL_ADDRESS: "Example street 1, 111 11 Stockholm, Sweden",
      LEGAL_SUPPORT_EMAIL: "support@example.com",
      LEGAL_SUPPORT_PHONE: "+46123456789",
      LEGAL_VAT_MODE: "small_business_exempt"
    }));

    expect(readiness.checkoutReady).toBe(true);
    expect(readiness.missingVariables).toEqual([]);
  });

  it("reports missing names and booleans without exposing values", () => {
    const env = parseServerEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_must_not_log",
      STRIPE_RESTRICTED_KEY: "rk_live_must_not_log",
      STRIPE_PRICE_BASIC_MONTHLY: "price_must_not_log",
      LEGAL_BUSINESS_NAME: "Example Sole Trader",
      LEGAL_ORGANIZATION_NUMBER: "000000-0000",
      LEGAL_POSTAL_ADDRESS: "Example street 1, 111 11 Stockholm, Sweden",
      LEGAL_SUPPORT_EMAIL: "support@example.com",
      LEGAL_SUPPORT_PHONE: "+46123456789",
      LEGAL_VAT_MODE: "small_business_exempt"
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

  it("blocks paid checkout until seller identity and VAT mode are configured", () => {
    const readiness = getBillingReadiness(parseServerEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      STRIPE_RESTRICTED_KEY: "rk_test_checkout",
      STRIPE_PRICE_BASIC_MONTHLY: "price_basic",
      STRIPE_COUPON_BASIC_LAUNCH: "coupon_launch"
    }));

    expect(readiness.checkoutReady).toBe(false);
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
    const readiness = getBillingReadiness(parseServerEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      STRIPE_RESTRICTED_KEY: "rk_test_checkout",
      STRIPE_PRICE_BASIC_MONTHLY: "price_basic",
      STRIPE_COUPON_BASIC_LAUNCH: "coupon_launch",
      LEGAL_BUSINESS_NAME: "Example Sole Trader",
      LEGAL_ORGANIZATION_NUMBER: "000000-0000",
      LEGAL_POSTAL_ADDRESS: "Example street 1, 111 11 Stockholm, Sweden",
      LEGAL_SUPPORT_EMAIL: "support@example.com",
      LEGAL_SUPPORT_PHONE: "+46123456789",
      LEGAL_VAT_MODE: "vat_registered"
    }));

    expect(readiness.checkoutReady).toBe(false);
    expect(readiness.missingVariables).toContain("LEGAL_VAT_NUMBER");
  });

  it("uses customer-safe unavailable wording", () => {
    expect(SUBSCRIPTIONS_UNAVAILABLE_MESSAGE).not.toMatch(
      /supabase|stripe|environment|webhook|api key|configuration/i
    );
  });
});
