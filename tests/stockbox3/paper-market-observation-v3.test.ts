import { describe, expect, it } from "vitest";
import type { MarketSnapshot, ProviderDiagnostic } from "@/lib/analysis/types";
import { toPaperMarketObservationV3 } from "@/lib/paper-trading/market-observation-v3";

function snapshot(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return {
    ticker: "AAPL",
    price: 201.25,
    currency: "USD",
    date: "2026-09-05T20:00:00.000Z",
    volume: 10,
    yearHigh: 220,
    yearLow: 150,
    provider: "trusted-market-provider",
    performance: {},
    ...overrides,
  };
}

function diagnostic(status: ProviderDiagnostic["status"]): ProviderDiagnostic {
  return {
    provider: "trusted-market-provider",
    capability: "market_data",
    status,
    observedAt: "2026-09-05T20:00:01.000Z",
  };
}

describe("Paper Trading V3 market observation adapter", () => {
  it("marks missing market data unavailable", () => {
    expect(toPaperMarketObservationV3(null)).toEqual({
      ticker: "UNKNOWN",
      price: null,
      currency: null,
      observedAt: null,
      provider: null,
      verification: "UNAVAILABLE",
    });
  });

  it("refuses to treat a date-only analysis close as an execution quote", () => {
    const result = toPaperMarketObservationV3(snapshot({ date: "2026-09-05" }));
    expect(result.verification).toBe("UNVERIFIED");
    expect(result.observedAt).toBeNull();
    expect(result.price).toBe(201.25);
  });

  it("accepts a timestamped provider observation without changing its price", () => {
    const result = toPaperMarketObservationV3(snapshot(), { providerDiagnostic: diagnostic("available") });
    expect(result).toEqual({
      ticker: "AAPL",
      price: 201.25,
      currency: "USD",
      observedAt: "2026-09-05T20:00:00.000Z",
      provider: "trusted-market-provider",
      verification: "VERIFIED",
    });
  });

  it("fails closed on unresolved source conflict", () => {
    expect(toPaperMarketObservationV3(snapshot(), { unresolvedConflict: true }).verification).toBe("CONFLICT");
  });

  it("propagates provider unavailability instead of fabricating verification", () => {
    expect(toPaperMarketObservationV3(snapshot(), { providerDiagnostic: diagnostic("unavailable") }).verification).toBe("UNAVAILABLE");
  });

  it("can use trusted diagnostic provider identity but still requires a real quote timestamp", () => {
    const verified = toPaperMarketObservationV3(snapshot({ provider: undefined }), { providerDiagnostic: diagnostic("available") });
    expect(verified.provider).toBe("trusted-market-provider");
    expect(verified.verification).toBe("VERIFIED");

    const dateOnly = toPaperMarketObservationV3(snapshot({ provider: undefined, date: "2026-09-05" }), { providerDiagnostic: diagnostic("available") });
    expect(dateOnly.verification).toBe("UNVERIFIED");
  });
});
