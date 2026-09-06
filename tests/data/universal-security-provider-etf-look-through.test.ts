import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EtfHolding } from "../../src/lib/analysis/universal-security";

const mocks = vi.hoisted(() => ({
  analyzeOperatingCompany: vi.fn(),
  fetchConfiguredMarketData: vi.fn(),
  fetchEtfProviderChain: vi.fn(),
  fetchYahooEtfHoldingFundamentals: vi.fn(),
  searchCompanies: vi.fn(),
}));

vi.mock("@/lib/data/enhanced-provider", () => ({
  analyzeCompany: mocks.analyzeOperatingCompany,
  fetchConfiguredMarketData: mocks.fetchConfiguredMarketData,
  searchCompanies: mocks.searchCompanies,
}));

vi.mock("@/lib/data/etf-provider-chain", () => ({
  fetchEtfProviderChain: mocks.fetchEtfProviderChain,
}));

vi.mock("@/lib/data/yahoo-etf-holding-fundamentals", () => ({
  fetchYahooEtfHoldingFundamentals: mocks.fetchYahooEtfHoldingFundamentals,
}));

vi.mock("@/lib/env/server", () => ({
  getServerEnv: vi.fn(() => ({ ALPHA_VANTAGE_API_KEY: "" })),
}));

import { analyzeCompany } from "../../src/lib/data/universal-security-provider";

const observedAt = "2026-09-06T16:50:00.000Z";

function diagnostic(provider: string, status = "available") {
  return {
    provider,
    capability: "specialized",
    status,
    observedAt,
  };
}

function source(name: string, provider: string) {
  return {
    name,
    url: `https://example.com/${provider}`,
    accessedAt: observedAt,
    freshness: "test fixture",
    provider,
    capability: "specialized",
    version: "test-v1",
  };
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());

  mocks.fetchConfiguredMarketData.mockResolvedValue({
    ok: false,
    message: "Market fixture unavailable",
    diagnostic: diagnostic("Market fixture", "unavailable"),
  });

  mocks.fetchEtfProviderChain.mockResolvedValue({
    ok: true,
    data: {
      input: {
        subtype: "equity_etf",
        expenseRatio: 0.002,
        holdings: [
          { ticker: "A", name: "A", weight: 0.5 },
          { ticker: "B", name: "B", weight: 0.3 },
          { ticker: "C", name: "C", weight: 0.2 },
        ],
      },
      category: "Large Blend",
      quoteType: "ETF",
      sources: [source("ETF metadata fixture", "etf-metadata-fixture")],
      diagnostics: [diagnostic("ETF metadata fixture")],
      warnings: [],
      fallbackFields: [],
    },
  });

  mocks.fetchYahooEtfHoldingFundamentals.mockImplementation(async (holding: EtfHolding) => ({
    ok: true,
    data: {
      revenueGrowth: holding.ticker === "A" ? 0.12 : 0.08,
      operatingMargin: holding.ticker === "A" ? 0.24 : 0.18,
    },
    diagnostic: diagnostic("Yahoo Holding Fixture"),
    source: source("Yahoo holding fundamentals fixture", "yahoo-holding-fixture"),
  }));
});

describe("universal ETF production look-through", () => {
  it("enriches highest-weight holdings before ETF scoring, stops at 80%, and preserves the 99% rating gate", async () => {
    const result = await analyzeCompany({
      company: {
        ticker: "TESTETF",
        name: "Test Broad ETF",
        securityType: "ETF/Fund",
      },
      analysisType: "summary",
      investmentProfile: "balanced",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(mocks.fetchYahooEtfHoldingFundamentals.mock.calls.map(([holding]) => holding.ticker)).toEqual(["A", "B"]);

    const etf = result.data.securityAnalysis?.etf;
    expect(etf).toBeDefined();
    expect(etf?.lookThrough.qualityCoveredWeight).toBeCloseTo(0.8, 8);
    expect(etf?.lookThrough.stockBoxQuality).not.toBeNull();
    expect(etf?.score.factors.find((factor) => factor.key === "holdings_quality")?.status).toBe("available");

    expect(result.data.sources.map((item) => item.provider)).toContain("yahoo-holding-fixture");
    expect(result.data.providerDiagnostics?.filter((item) => item.provider === "Yahoo Holding Fixture")).toHaveLength(1);

    expect(result.data.dataCoverage).toBeLessThan(0.99);
    expect(result.data.recommendation).toBe("No Rating");
  });
});
