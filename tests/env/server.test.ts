import { describe, expect, it } from "vitest";
import {
  DEFAULT_POSTHOG_HOST,
  isBasicLaunchCheckoutConfigured,
  parseServerEnv
} from "../../src/lib/env/server";

describe("server environment parsing", () => {
  it.each([undefined, "", "not-a-url", "://broken"])(
    "falls back for an optional PostHog host value of %s",
    (host) => {
      const env = parseServerEnv({ NEXT_PUBLIC_POSTHOG_HOST: host });
      expect(env.NEXT_PUBLIC_POSTHOG_HOST).toBe(DEFAULT_POSTHOG_HOST);
    }
  );

  it("keeps a valid custom PostHog host", () => {
    const env = parseServerEnv({ NEXT_PUBLIC_POSTHOG_HOST: "https://eu.posthog.com" });
    expect(env.NEXT_PUBLIC_POSTHOG_HOST).toBe("https://eu.posthog.com");
  });

  it("enables Basic checkout without requiring a webhook secret", () => {
    const env = parseServerEnv({
      STRIPE_RESTRICTED_KEY: "rk_test_checkout",
      STRIPE_PRICE_BASIC_MONTHLY: "price_basic",
      STRIPE_COUPON_BASIC_LAUNCH: "coupon_launch"
    });

    expect(env.STRIPE_WEBHOOK_SECRET).toBeUndefined();
    expect(isBasicLaunchCheckoutConfigured(env)).toBe(true);
  });

  it.each([
    "STRIPE_RESTRICTED_KEY",
    "STRIPE_PRICE_BASIC_MONTHLY",
    "STRIPE_COUPON_BASIC_LAUNCH"
  ] as const)("keeps Basic checkout disabled without %s", (missingKey) => {
    const values: Record<string, string | undefined> = {
      STRIPE_RESTRICTED_KEY: "rk_test_checkout",
      STRIPE_PRICE_BASIC_MONTHLY: "price_basic",
      STRIPE_COUPON_BASIC_LAUNCH: "coupon_launch"
    };
    values[missingKey] = undefined;

    expect(isBasicLaunchCheckoutConfigured(parseServerEnv(values))).toBe(false);
  });
});
