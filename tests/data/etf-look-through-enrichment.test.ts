import { describe, expect, it, vi } from "vitest";
import type { EtfHolding } from "../../src/lib/analysis/universal-security";
import { enrichEtfLookThroughHoldings } from "../../src/lib/data/etf-look-through-enrichment";

const holdings: EtfHolding[] = [
  { ticker: "C", name: "C", weight: 0.2 },
  { ticker: "A", name: "A", weight: 0.5 },
  { ticker: "B", name: "B", weight: 0.3 },
];

describe("ETF look-through enrichment", () => {
  it("fetches highest portfolio weights first and stops once 80% verified quality weight is reached", async () => {
    const fetchHolding = vi.fn(async (holding: EtfHolding) => ({
      ok: true as const,
      data: {
        revenueGrowth: holding.ticker === "A" ? 0.12 : 0.08,
        operatingMargin: holding.ticker === "A" ? 0.24 : 0.18,
      },
    }));

    const result = await enrichEtfLookThroughHoldings(holdings, fetchHolding, { maxRequests: 10 });

    expect(fetchHolding.mock.calls.map(([holding]) => holding.ticker)).toEqual(["A", "B"]);
    expect(result.targetReached).toBe(true);
    expect(result.verifiedQualityWeight).toBeCloseTo(0.8, 8);
    expect(result.attemptedTickers).toEqual(["A", "B"]);
    expect(result.holdings.find((holding) => holding.ticker === "A")?.operatingMargin).toBe(0.24);
    expect(result.holdings.find((holding) => holding.ticker === "C")?.operatingMargin).toBeUndefined();
  });

  it("does not count failed or incomplete holding evidence toward verified quality weight", async () => {
    const fetchHolding = vi.fn(async (holding: EtfHolding) => {
      if (holding.ticker === "A") return { ok: false as const, message: "upstream unavailable" };
      if (holding.ticker === "B") return { ok: true as const, data: { revenueGrowth: 0.1 } };
      return { ok: true as const, data: { revenueGrowth: 0.06, operatingMargin: 0.16 } };
    });

    const result = await enrichEtfLookThroughHoldings(holdings, fetchHolding, { maxRequests: 10 });

    expect(result.targetReached).toBe(false);
    expect(result.verifiedQualityWeight).toBeCloseTo(0.2, 8);
    expect(result.failedTickers).toEqual(["A"]);
    expect(result.holdings.find((holding) => holding.ticker === "B")?.operatingMargin).toBeUndefined();
  });

  it("never calls the fundamentals adapter for holdings without a ticker", async () => {
    const input: EtfHolding[] = [
      { name: "Private basket", weight: 0.2 },
      { ticker: "A", name: "A", weight: 0.8 },
    ];
    const fetchHolding = vi.fn(async () => ({
      ok: true as const,
      data: { epsGrowth: 0.11, operatingMargin: 0.22 },
    }));

    const result = await enrichEtfLookThroughHoldings(input, fetchHolding, { maxRequests: 10 });

    expect(fetchHolding).toHaveBeenCalledTimes(1);
    expect(result.attemptedTickers).toEqual(["A"]);
    expect(result.targetReached).toBe(true);
  });

  it("does not spend requests when ticker-bearing holdings cannot mathematically reach 80% quality coverage", async () => {
    const input: EtfHolding[] = [
      { name: "Unmapped basket", weight: 0.4 },
      { ticker: "A", name: "A", weight: 0.35 },
      { ticker: "B", name: "B", weight: 0.25 },
    ];
    const fetchHolding = vi.fn(async () => ({
      ok: true as const,
      data: { revenueGrowth: 0.09, operatingMargin: 0.2 },
    }));

    const result = await enrichEtfLookThroughHoldings(input, fetchHolding, { maxRequests: 10 });

    expect(fetchHolding).not.toHaveBeenCalled();
    expect(result.attemptedTickers).toEqual([]);
    expect(result.verifiedQualityWeight).toBe(0);
    expect(result.targetReached).toBe(false);
    expect(result.budgetExhausted).toBe(false);
  });

  it("stops at the request budget and reports that the target was not reached", async () => {
    const fetchHolding = vi.fn(async () => ({
      ok: true as const,
      data: { revenueGrowth: 0.09, operatingMargin: 0.2 },
    }));

    const result = await enrichEtfLookThroughHoldings(holdings, fetchHolding, { maxRequests: 1 });

    expect(fetchHolding).toHaveBeenCalledTimes(1);
    expect(result.attemptedTickers).toEqual(["A"]);
    expect(result.verifiedQualityWeight).toBeCloseTo(0.5, 8);
    expect(result.targetReached).toBe(false);
    expect(result.budgetExhausted).toBe(true);
  });
});
