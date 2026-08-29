import { describe, expect, it } from "vitest";
import { getMarketDataProviderChain, parseServerEnv } from "../../src/lib/env/server";
import { configuredMarketDataProviderStatuses } from "../../src/lib/data/provider";

describe("market-data provider chain", () => {
  it("uses only Stooq when Stooq is the only configured market provider", () => {
    const env = parseServerEnv({ MARKET_DATA_PROVIDER: "stooq" });
    expect(getMarketDataProviderChain(env)).toEqual(["stooq"]);
    expect(configuredMarketDataProviderStatuses(env).map((item) => item.providerId)).toEqual([
      "stooq-eod",
    ]);
  });

  it("keeps Twelve Data first and uses only explicitly configured fallbacks", () => {
    const env = parseServerEnv({
      MARKET_DATA_PROVIDER: "twelve_data",
      MARKET_DATA_FALLBACK_PROVIDERS: "stooq",
      TWELVE_DATA_API_KEY: "test-key",
    });
    expect(getMarketDataProviderChain(env)).toEqual(["twelve_data", "stooq"]);
  });

  it("honors an explicitly disabled market layer", () => {
    const env = parseServerEnv({ MARKET_DATA_PROVIDER: "disabled" });
    expect(getMarketDataProviderChain(env)).toEqual([]);
  });
});
