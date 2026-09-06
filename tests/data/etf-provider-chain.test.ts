import { describe, expect, it, vi } from "vitest";
import type { AnalysisSource, CompanySearchResult, ProviderDiagnostic } from "../../src/lib/analysis/types";
import { fetchEtfProviderChain } from "../../src/lib/data/etf-provider-chain";

const company: CompanySearchResult = {
  ticker: "QQQ",
  name: "Invesco QQQ Trust",
  securityType: "ETF/Fund",
};

function source(name: string, provider: string): AnalysisSource {
  return {
    name,
    url: `https://example.com/${provider}`,
    accessedAt: "2026-09-06T12:00:00.000Z",
    freshness: "test fixture",
    provider,
    capability: "specialized",
    dataAsOf: null,
    version: "test-v1",
  };
}

function diagnostic(provider: string, status: ProviderDiagnostic["status"] = "available"): ProviderDiagnostic {
  return {
    provider,
    capability: "specialized",
    status,
    observedAt: "2026-09-06T12:00:00.000Z",
  };
}

const yahooAvailable = {
  ok: true as const,
  data: {
    input: {
      expenseRatio: 0.001,
      assetsUnderManagement: null,
      holdings: [
        { ticker: "A", name: "A", weight: 0.6 },
        { ticker: "B", name: "B", weight: 0.4 },
      ],
    },
    category: "Large Growth",
    fundFamily: "Invesco",
    quoteType: "ETF",
    source: source("Yahoo ETF", "yahoo-etf"),
    diagnostic: diagnostic("Yahoo ETF"),
  },
};

const alphaAvailable = {
  ok: true as const,
  data: {
    input: {
      expenseRatio: 0.005,
      assetsUnderManagement: 100_000_000,
      turnover: 0.04,
      holdings: [
        { ticker: "A", name: "A", weight: 0.6 },
        { ticker: "B", name: "B", weight: 0.4 },
      ],
    },
    source: source("Alpha ETF", "alpha-vantage-etf"),
    diagnostic: diagnostic("Alpha ETF"),
  },
};

describe("ETF specialist provider chain", () => {
  it("does not call Alpha Vantage when no API key is configured", async () => {
    const yahoo = vi.fn(async () => yahooAvailable);
    const alphaVantage = vi.fn(async () => alphaAvailable);

    const result = await fetchEtfProviderChain(company, "", { yahoo, alphaVantage });

    expect(result.ok).toBe(true);
    expect(yahoo).toHaveBeenCalledTimes(1);
    expect(alphaVantage).not.toHaveBeenCalled();
    if (!result.ok) return;
    expect(result.data.sources.map((item) => item.provider)).toEqual(["yahoo-etf"]);
    expect(result.data.input.expenseRatio).toBe(0.001);
  });

  it("keeps Yahoo authoritative while Alpha Vantage fills only verified gaps", async () => {
    const yahoo = vi.fn(async () => yahooAvailable);
    const alphaVantage = vi.fn(async () => alphaAvailable);

    const result = await fetchEtfProviderChain(company, "alpha-key", { yahoo, alphaVantage });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.input.expenseRatio).toBe(0.001);
    expect(result.data.input.assetsUnderManagement).toBe(100_000_000);
    expect(result.data.input.turnover).toBe(0.04);
    expect(result.data.fallbackFields).toEqual(expect.arrayContaining(["assetsUnderManagement", "turnover"]));
    expect(result.data.sources.map((item) => item.provider)).toEqual(["yahoo-etf", "alpha-vantage-etf"]);
    expect(result.data.category).toBe("Large Growth");
    expect(result.data.quoteType).toBe("ETF");
  });

  it("uses Alpha Vantage as a full specialist fallback when Yahoo ETF metadata is unavailable", async () => {
    const yahooUnavailable = {
      ok: false as const,
      message: "Yahoo ETF metadata unavailable",
      diagnostic: diagnostic("Yahoo ETF", "unavailable"),
    };
    const yahoo = vi.fn(async () => yahooUnavailable);
    const alphaVantage = vi.fn(async () => alphaAvailable);

    const result = await fetchEtfProviderChain(company, "alpha-key", { yahoo, alphaVantage });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.input.assetsUnderManagement).toBe(100_000_000);
    expect(result.data.sources.map((item) => item.provider)).toEqual(["alpha-vantage-etf"]);
    expect(result.data.diagnostics.map((item) => item.provider)).toEqual(["Yahoo ETF", "Alpha ETF"]);
    expect(result.data.warnings.join(" ")).toContain("Yahoo ETF metadata unavailable");
  });

  it("does not claim Alpha provenance when Alpha contributes no data", async () => {
    const completeYahoo = {
      ...yahooAvailable,
      data: {
        ...yahooAvailable.data,
        input: {
          ...yahooAvailable.data.input,
          assetsUnderManagement: 200_000_000,
          turnover: 0.02,
        },
      },
    };
    const yahoo = vi.fn(async () => completeYahoo);
    const alphaVantage = vi.fn(async () => alphaAvailable);

    const result = await fetchEtfProviderChain(company, "alpha-key", { yahoo, alphaVantage });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.fallbackFields).toEqual([]);
    expect(result.data.sources.map((item) => item.provider)).toEqual(["yahoo-etf"]);
  });
});
