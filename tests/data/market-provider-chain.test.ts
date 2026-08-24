import { describe, expect, it } from "vitest";
import { getMarketDataProviderChain, parseServerEnv } from "../../src/lib/env/server";
import { configuredMarketDataProviderStatuses } from "../../src/lib/data/provider";

describe("market-data provider chain", () => {
  it("adds Yahoo as the built-in no-key fallback when Stooq is selected", () => {
    const env = parseServerEnv({ MARKET_DATA_PROVIDER: "stooq" });
    expect(getMarketDataProviderChain(env)).toEqual(["stooq", "yahoo"]);
    expect(configuredMarketDataProviderStatuses(env).map((item) => item.providerId)).toEqual([
      "stooq-eod",
      "yahoo-chart",
    ]);
  });

  it("keeps Twelve Data first when configured and still ends with Yahoo", () => {
    const env = parseServerEnv({
      MARKET_DATA_PROVIDER: "twelve_data",
      MARKET_DATA_FALLBACK_PROVIDERS: "stooq",
      TWELVE_DATA_API_KEY: "test-key",
    });
    expect(getMarketDataProviderChain(env)).toEqual(["twelve_data", "stooq", "yahoo"]);
  });

  it("honors an explicitly disabled market layer", () => {
    const env = parseServerEnv({ MARKET_DATA_PROVIDER: "disabled" });
    expect(getMarketDataProviderChain(env)).toEqual([]);
  });
});
