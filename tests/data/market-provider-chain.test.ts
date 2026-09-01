import { describe, expect, it } from "vitest";
import { getMarketDataProviderChain, parseServerEnv } from "../../src/lib/env/server";
import { configuredMarketDataProviderStatuses } from "../../src/lib/data/provider";

describe("market-data provider chain", () => {
  it("does not silently append Yahoo after an explicitly selected provider", () => {
    const env = parseServerEnv({ MARKET_DATA_PROVIDER: "stooq" });
    expect(getMarketDataProviderChain(env)).toEqual(["stooq"]);
    expect(configuredMarketDataProviderStatuses(env).map((item) => item.providerId)).toEqual([
      "stooq-eod",
    ]);
  });

  it("keeps only explicitly configured providers in fallback order", () => {
    const env = parseServerEnv({
      MARKET_DATA_PROVIDER: "twelve_data",
      MARKET_DATA_FALLBACK_PROVIDERS: "stooq",
      TWELVE_DATA_API_KEY: "test-key",
    });
    expect(getMarketDataProviderChain(env)).toEqual(["twelve_data", "stooq"]);
  });

  it("allows Yahoo only when it is explicitly configured as a fallback", () => {
    const env = parseServerEnv({
      MARKET_DATA_PROVIDER: "twelve_data",
      MARKET_DATA_FALLBACK_PROVIDERS: "stooq,yahoo",
      TWELVE_DATA_API_KEY: "test-key",
    });
    expect(getMarketDataProviderChain(env)).toEqual(["twelve_data", "stooq", "yahoo"]);
  });

  it("does not duplicate Yahoo when it is already the primary provider", () => {
    const env = parseServerEnv({ MARKET_DATA_PROVIDER: "yahoo", MARKET_DATA_FALLBACK_PROVIDERS: "yahoo" });
    expect(getMarketDataProviderChain(env)).toEqual(["yahoo"]);
  });

  it("honors an explicitly disabled market layer", () => {
    const env = parseServerEnv({ MARKET_DATA_PROVIDER: "disabled" });
    expect(getMarketDataProviderChain(env)).toEqual([]);
  });
});
