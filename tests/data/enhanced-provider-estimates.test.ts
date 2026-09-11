import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  coreAnalyze: vi.fn(),
  estimateFetch: vi.fn(),
  env: {
    ESTIMATES_PROVIDER: "twelve_data" as "twelve_data" | "disabled",
    TWELVE_DATA_API_KEY: "licensed-key",
  },
}));

vi.mock("../../src/lib/data/provider", () => ({
  analyzeCompany: mocks.coreAnalyze,
  searchCompanies: vi.fn(),
}));

vi.mock("../../src/lib/env/server", () => ({
  getServerEnv: () => mocks.env,
}));

vi.mock("../../src/lib/data/twelve-data-estimates", () => ({
  fetchTwelveDataEstimateSnapshot: mocks.estimateFetch,
}));

vi.mock("../../src/lib/data/official-research", () => ({
  fetchOfficialResearchBundle: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../src/lib/data/official-analysis-context", () => ({
  runWithOfficialAnalysisContext: async (_context: unknown, callback: () => unknown) => callback(),
}));

vi.mock("../../src/lib/analysis/report-currency-integrity", () => ({
  enforceReportHistoricalCurrencyIntegrity: vi.fn(),
}));

import { analyzeCompany } from "../../src/lib/data/enhanced-provider";

const company = {
  ticker: "AAPL",
  canonicalTicker: "AAPL",
  name: "Apple Inc.",
  currency: "USD",
};

const snapshot = {
  forwardEstimates: {
    nextYearRevenueGrowth: 0.1,
    nextYearEpsGrowth: 0.2,
    nextYearFreeCashFlowGrowth: null,
  },
  earningsConsensus: [],
  revenueConsensus: [],
  epsRevisions: [],
  currency: "USD",
  coverage: 1,
};

function coreReport() {
  return {
    generatedAt: "2026-09-09T12:00:00.000Z",
    sources: [],
    providerDiagnostics: [],
  };
}

describe("enhanced provider licensed estimates wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.ESTIMATES_PROVIDER = "twelve_data";
    mocks.env.TWELVE_DATA_API_KEY = "licensed-key";
    mocks.coreAnalyze.mockResolvedValue({
      ok: true,
      data: coreReport(),
      sources: [],
      providerDiagnostics: [],
    });
    mocks.estimateFetch.mockResolvedValue({
      ok: true,
      data: snapshot,
      diagnostic: {
        provider: "Twelve Data analyst estimates",
        capability: "estimates",
        status: "available",
        observedAt: "2026-09-09T12:00:00.000Z",
      },
    });
  });

  it("enriches a successful analysis when Twelve Data estimates are explicitly enabled", async () => {
    const result = await analyzeCompany({
      company,
      analysisType: "summary",
      investmentProfile: "balanced",
    } as never);

    expect(mocks.estimateFetch).toHaveBeenCalledWith(company, "licensed-key");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.forwardEstimates).toEqual(expect.objectContaining({
      nextYearRevenueGrowth: 0.1,
      nextYearEpsGrowth: 0.2,
    }));
    expect(result.data.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ provider: "twelve-data-estimates", capability: "estimates" }),
    ]));
    expect(result.data.providerDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ capability: "estimates", status: "available" }),
    ]));
  });

  it("does not request analyst estimates when the provider is disabled", async () => {
    mocks.env.ESTIMATES_PROVIDER = "disabled";

    const result = await analyzeCompany({
      company,
      analysisType: "summary",
      investmentProfile: "balanced",
    } as never);

    expect(result.ok).toBe(true);
    expect(mocks.estimateFetch).not.toHaveBeenCalled();
  });

  it("keeps the core analysis usable and exposes diagnostics when estimates are unavailable", async () => {
    mocks.estimateFetch.mockResolvedValue({
      ok: false,
      reason: "rate_limited",
      message: "Estimate provider rate limited.",
      diagnostic: {
        provider: "Twelve Data analyst estimates",
        capability: "estimates",
        status: "unavailable",
        reason: "rate_limited",
        observedAt: "2026-09-09T12:00:00.000Z",
      },
    });

    const result = await analyzeCompany({
      company,
      analysisType: "summary",
      investmentProfile: "balanced",
    } as never);

    expect(mocks.estimateFetch).toHaveBeenCalledWith(company, "licensed-key");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.forwardEstimates).toBeUndefined();
    expect(result.data.providerDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ capability: "estimates", status: "unavailable", reason: "rate_limited" }),
    ]));
    expect(result.data.sources).toEqual([]);
  });
});
