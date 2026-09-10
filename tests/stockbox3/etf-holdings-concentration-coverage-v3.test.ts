import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeEtf, computeLookThroughMetrics } from "@/lib/analysis/universal-security";
import { fetchYahooEtfData } from "@/lib/data/yahoo-etf";

const etf = {
  ticker: "TEST",
  canonicalTicker: "TEST",
  name: "Test Broad Market ETF",
  exchange: "NYSE",
  currency: "USD",
  securityType: "ETF/Fund" as const,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("StockBox 3 ETF holdings concentration coverage", () => {
  it("does not treat a partial holdings list as a complete HHI distribution", () => {
    const metrics = computeLookThroughMetrics([
      { name: "Holding A", weight: 0.15 },
      { name: "Holding B", weight: 0.10 },
      { name: "Holding C", weight: 0.05 },
    ]);

    expect(metrics.coveredWeight).toBeCloseTo(0.30, 10);
    expect(metrics.largestHoldingWeight).toBeCloseTo(0.15, 10);
    expect(metrics.top10Weight).toBeCloseTo(0.30, 10);
    expect(metrics.holdingsHhi).toBeNull();
  });

  it("keeps Yahoo top-holdings HHI missing when the returned holdings do not represent at least 95% of portfolio weight", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("quoteSummary")) {
        return {
          ok: true,
          json: async () => ({
            quoteSummary: {
              result: [{
                fundProfile: { categoryName: "Large Blend" },
                topHoldings: {
                  holdingCount: { raw: 100 },
                  holdings: [
                    { holdingName: "Holding A", holdingPercent: { raw: 0.15 } },
                    { holdingName: "Holding B", holdingPercent: { raw: 0.10 } },
                    { holdingName: "Holding C", holdingPercent: { raw: 0.05 } },
                  ],
                },
              }],
            },
          }),
        } as Response;
      }

      return {
        ok: true,
        json: async () => ({
          quoteResponse: {
            result: [{ quoteType: "ETF", regularMarketPrice: { raw: 100 } }],
          },
        }),
      } as Response;
    });

    const result = await fetchYahooEtfData(etf);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);

    expect(result.data.input.numberOfHoldings).toBe(100);
    expect(result.data.input.top10Weight).toBeCloseTo(0.30, 10);
    expect(result.data.input.largestHoldingWeight).toBeCloseTo(0.15, 10);
    expect(result.data.input.holdingsHhi).toBeNull();
  });

  it("retains HHI when holdings represent at least 95% of portfolio weight", () => {
    const metrics = computeLookThroughMetrics([
      { name: "Holding A", weight: 0.50 },
      { name: "Holding B", weight: 0.30 },
      { name: "Holding C", weight: 0.16 },
    ]);

    expect(metrics.coveredWeight).toBeCloseTo(0.96, 10);
    expect(metrics.holdingsHhi).toBeCloseTo(0.50 ** 2 + 0.30 ** 2 + 0.16 ** 2, 10);
  });

  it("does not let holding count alone satisfy the ETF diversification factor", () => {
    const result = analyzeEtf({
      subtype: "equity_etf",
      numberOfHoldings: 500,
    });
    const diversification = result.score.factors.find((factor) => factor.key === "diversification");

    expect(diversification?.status).toBe("missing");
    expect(diversification?.score).toBeNull();
  });

  it("does not normalize an incomplete Yahoo sector distribution into a complete sector HHI", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("quoteSummary")) {
        return {
          ok: true,
          json: async () => ({
            quoteSummary: {
              result: [{
                fundProfile: { categoryName: "Large Blend" },
                topHoldings: {
                  holdingCount: { raw: 100 },
                  sectorWeightings: [
                    { technology: { raw: 0.25 } },
                    { financialServices: { raw: 0.15 } },
                  ],
                },
              }],
            },
          }),
        } as Response;
      }

      return {
        ok: true,
        json: async () => ({
          quoteResponse: {
            result: [{ quoteType: "ETF", regularMarketPrice: { raw: 100 } }],
          },
        }),
      } as Response;
    });

    const result = await fetchYahooEtfData(etf);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);

    expect(result.data.input.sectorHhi).toBeNull();
  });
});
