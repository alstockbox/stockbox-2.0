import { beforeEach, describe, expect, it, vi } from "vitest";

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

const observedAt = "2026-09-06T17:30:00.000Z";

function diagnostic(provider: string, status = "available") {
  return {
    provider,
    capability: "specialized",
    status,
    observedAt,
  };
}

function source(provider: string) {
  return {
    name: `${provider} source`,
    url: `https://example.com/${provider}`,
    accessedAt: observedAt,
    freshness: "test fixture",
    provider,
    capability: "specialized",
    version: "test-v1",
  };
}

function providerResult(args: { category: string | null; quoteType: string | null }) {
  return {
    ok: true,
    data: {
      input: {
        subtype: "equity_etf",
        expenseRatio: 0.01,
        holdings: [
          { ticker: "A", name: "A", weight: 0.6 },
          { ticker: "B", name: "B", weight: 0.4 },
        ],
      },
      category: args.category,
      fundFamily: null,
      quoteType: args.quoteType,
      sources: [source("fund-metadata-fixture")],
      diagnostics: [diagnostic("Fund metadata fixture")],
      warnings: [],
      fallbackFields: [],
    },
  };
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.fetchConfiguredMarketData.mockResolvedValue({
    ok: false,
    message: "Market fixture unavailable",
    diagnostic: diagnostic("Market fixture", "unavailable"),
  });
  mocks.fetchYahooEtfHoldingFundamentals.mockResolvedValue({
    ok: true,
    data: { revenueGrowth: 0.1, operatingMargin: 0.2 },
    diagnostic: diagnostic("Yahoo Holding Fixture"),
    source: source("yahoo-holding-fixture"),
  });
});

describe("universal fund-structure production boundary", () => {
  it("fails closed for an explicitly verified closed-end fund before ETF look-through or scoring", async () => {
    mocks.fetchEtfProviderChain.mockResolvedValue(providerResult({
      category: "Closed-End Fund - Taxable Fixed Income",
      quoteType: "EQUITY",
    }));

    const result = await analyzeCompany({
      company: {
        ticker: "TESTCEF",
        name: "Test Dynamic Income Fund",
        securityType: "ETF/Fund",
      },
      analysisType: "summary",
      investmentProfile: "balanced",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/closed-end fund/i);
    expect(result.warnings?.join(" ")).toMatch(/NAV|discount|distribution|leverage/i);
    expect(mocks.fetchYahooEtfHoldingFundamentals).not.toHaveBeenCalled();
  });

  it("fails closed when a listed fund lacks enough evidence to distinguish ETF from CEF/other structure", async () => {
    mocks.fetchEtfProviderChain.mockResolvedValue(providerResult({
      category: "Income Fund",
      quoteType: null,
    }));

    const result = await analyzeCompany({
      company: {
        ticker: "TESTFUND",
        name: "Test Income Fund",
        securityType: "ETF/Fund",
      },
      analysisType: "summary",
      investmentProfile: "balanced",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/fund structure/i);
    expect(result.warnings?.join(" ")).toMatch(/ETF|closed-end|structure/i);
    expect(mocks.fetchYahooEtfHoldingFundamentals).not.toHaveBeenCalled();
  });
});
