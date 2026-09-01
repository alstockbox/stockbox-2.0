import { describe, expect, it } from "vitest";
import {
  DEFAULT_POSTHOG_HOST,
  getEstimatesProvider,
  getMarketDataProvider,
  getMarketDataProviderChain,
  getSecUserAgent,
  isBasicLaunchCheckoutConfigured,
  isFinancialProviderConfigured,
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

  it("preserves the payout cron secret for authenticated cron routes", () => {
    const env = parseServerEnv({ CRON_SECRET: "test-cron-secret" });
    expect(env.CRON_SECRET).toBe("test-cron-secret");
  });

  it.each([undefined, "", "   "])("normalizes MARKET_DATA_PROVIDER %s to the reliable no-env Yahoo fallback", (provider) => {
    const env = parseServerEnv({ MARKET_DATA_PROVIDER: provider });
    expect(getMarketDataProvider(env)).toBe("yahoo");
  });

  it.each(["stooq", " STOOQ "])("normalizes an enabled Stooq provider value of %s", (provider) => {
    expect(getMarketDataProvider(parseServerEnv({ MARKET_DATA_PROVIDER: provider }))).toBe("stooq");
  });

  it("preserves an explicitly disabled market provider", () => {
    expect(getMarketDataProvider(parseServerEnv({ MARKET_DATA_PROVIDER: " disabled " }))).toBe("disabled");
  });

  it("builds a de-duplicated provider chain without silently adding Yahoo", () => {
    const env = parseServerEnv({ MARKET_DATA_PROVIDER: "twelve_data", MARKET_DATA_FALLBACK_PROVIDERS: "stooq,twelve_data" });
    expect(getMarketDataProviderChain(env)).toEqual(["twelve_data", "stooq"]);
  });

  it("uses Yahoo when it is explicitly configured as a fallback", () => {
    const env = parseServerEnv({ MARKET_DATA_PROVIDER: "twelve_data", MARKET_DATA_FALLBACK_PROVIDERS: "stooq,yahoo" });
    expect(getMarketDataProviderChain(env)).toEqual(["twelve_data", "stooq", "yahoo"]);
  });

  it("keeps Yahoo as the default chain when no market-data provider is configured", () => {
    expect(getMarketDataProviderChain(parseServerEnv({}))).toEqual(["yahoo"]);
  });

  it("keeps analyst estimates disabled unless explicitly enabled", () => {
    expect(getEstimatesProvider(parseServerEnv({ TWELVE_DATA_API_KEY: "key" }))).toBe("disabled");
  });

  it("enables Twelve Data analyst estimates only when explicitly configured", () => {
    expect(getEstimatesProvider(parseServerEnv({ ESTIMATES_PROVIDER: "twelve_data" }))).toBe("twelve_data");
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

  it("configures SEC from an explicit user agent", () => {
    const env = parseServerEnv({ SEC_USER_AGENT: "  StockBox/2.0 ops@stockbox.test  " });

    expect(getSecUserAgent(env)).toBe("StockBox/2.0 ops@stockbox.test");
    expect(isFinancialProviderConfigured(env)).toBe(true);
  });

  it("configures SEC from the admin alert email", () => {
    const env = parseServerEnv({ ADMIN_ALERT_EMAIL: "alerts@stockbox.test" });

    expect(getSecUserAgent(env)).toBe("StockBox/1.0 alerts@stockbox.test");
    expect(isFinancialProviderConfigured(env)).toBe(true);
  });

  it("configures SEC from the first admin email", () => {
    const env = parseServerEnv({
      ADMIN_EMAILS: " , owner@stockbox.test, second@stockbox.test"
    });

    expect(getSecUserAgent(env)).toBe("StockBox/1.0 owner@stockbox.test");
    expect(isFinancialProviderConfigured(env)).toBe(true);
  });

  it("leaves SEC unconfigured without a usable contact", () => {
    const env = parseServerEnv({
      SEC_USER_AGENT: "   ",
      ADMIN_EMAILS: " , "
    });

    expect(getSecUserAgent(env)).toBeNull();
    expect(isFinancialProviderConfigured(env)).toBe(false);
  });

  it("prioritizes the explicit SEC user agent over email fallbacks", () => {
    const env = parseServerEnv({
      SEC_USER_AGENT: "StockBox/3.0 explicit@stockbox.test",
      ADMIN_ALERT_EMAIL: "alerts@stockbox.test",
      ADMIN_EMAILS: "owner@stockbox.test"
    });

    expect(getSecUserAgent(env)).toBe("StockBox/3.0 explicit@stockbox.test");
  });
});
