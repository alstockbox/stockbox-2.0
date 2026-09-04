import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanyFundamentals, CompanySearchResult, ReitSpecializedMetrics } from "../../src/lib/analysis/types";
import { providerDiagnostic } from "../../src/lib/data/providers";

const mocks = vi.hoisted(() => ({
  coreFetch: vi.fn(),
  specializedFetch: vi.fn(),
}));

vi.mock("../../src/lib/data/sec-core", () => ({
  SEC_CAPABILITIES: {
    supportedCountries: ["US"],
    supportedExchanges: ["NYSE", "NASDAQ"],
    supportsFundamentals: true,
    supportsMarketData: false,
    supportsEstimates: false,
  },
  fetchCompanyFundamentalsResult: mocks.coreFetch,
  fetchCompanyFundamentals: vi.fn(),
  secFundamentalsProvider: {},
  padCik: (value: string) => value.replace(/\D/g, "").padStart(10, "0"),
}));

vi.mock("../../src/lib/data/sec-reit-specialized-provider", () => ({
  fetchSecReitSpecializedData: mocks.specializedFetch,
}));

import { fetchCompanyFundamentalsResult, secFundamentalsProvider } from "../../src/lib/data/sec";

const reitCompany: CompanySearchResult = {
  ticker: "REIT",
  name: "Example Realty Trust",
  country: "US",
  exchange: "NYSE",
  cik: "0000000001",
  securityType: "Common Stock",
};

const commonCompany: CompanySearchResult = {
  ...reitCompany,
  ticker: "OPER",
  name: "Example Operating Company",
};

function coreFundamentals(archetype: CompanyFundamentals["analysisArchetype"]): CompanyFundamentals {
  return {
    ticker: archetype === "reit" ? "REIT" : "OPER",
    name: archetype === "reit" ? "Example Realty Trust" : "Example Operating Company",
    sector: archetype === "reit" ? "realEstate" : "industrials",
    industry: archetype === "reit" ? "REIT" : "Industrial Products",
    analysisArchetype: archetype,
    annual: [],
    annualPeriods: [],
    specialized: undefined,
    diagnostics: {
      latestFinancialPeriodEnd: "2026-06-30",
      latestAnnualPeriodEnd: "2025-12-31",
      dataAgeDays: null,
      ttmStatus: "annual_fallback",
      providerDiagnostics: [providerDiagnostic("SEC Companyfacts", "fundamentals", "available")],
      dataStatus: "current",
    },
  };
}

function reitSpecialized(): ReitSpecializedMetrics {
  const empty = { value: null };
  return {
    kind: "reit",
    fundsFromOperations: empty,
    fundsFromOperationsPerShare: empty,
    adjustedFundsFromOperations: { value: null, companyDefined: true },
    adjustedFundsFromOperationsPerShare: { value: null, companyDefined: true },
    fundsFromOperationsGrowth: empty,
    adjustedFundsFromOperationsGrowth: empty,
    adjustedFundsFromOperationsPayout: empty,
    dividendCoverage: empty,
    occupancy: { value: 0.988, unit: "ratio", dataAsOf: "2026-06-30" },
    sameStoreNoiGrowth: { value: 0.085, unit: "ratio", dataAsOf: "2026-06-30" },
    netDebtToEbitdare: { value: 5.4, unit: "ratio", dataAsOf: "2026-06-30" },
    debtMaturities: empty,
    fixedChargeCoverage: { value: 4.7, unit: "ratio", dataAsOf: "2026-06-30" },
    netAssetValue: empty,
  };
}

describe("SEC REIT specialist enrichment integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enriches a SEC-classified REIT with period-safe specialist facts and preserves both diagnostics", async () => {
    mocks.coreFetch.mockResolvedValue({
      ok: true,
      data: coreFundamentals("reit"),
      diagnostic: providerDiagnostic("SEC Companyfacts", "fundamentals", "available"),
    });
    mocks.specializedFetch.mockResolvedValue({
      ok: true,
      data: reitSpecialized(),
      diagnostic: providerDiagnostic("SEC REIT filings", "specialized", "available"),
    });

    const result = await fetchCompanyFundamentalsResult(reitCompany);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.specialized).toMatchObject({
        kind: "reit",
        occupancy: { value: 0.988 },
        sameStoreNoiGrowth: { value: 0.085 },
        netDebtToEbitdare: { value: 5.4 },
        fixedChargeCoverage: { value: 4.7 },
      });
      expect(result.data.diagnostics?.providerDiagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({ provider: "SEC Companyfacts", capability: "fundamentals", status: "available" }),
        expect.objectContaining({ provider: "SEC REIT filings", capability: "specialized", status: "available" }),
      ]));
    }
    expect(mocks.specializedFetch).toHaveBeenCalledTimes(1);
    expect(mocks.specializedFetch).toHaveBeenCalledWith(reitCompany);
  });

  it("does not request REIT exhibits for a non-REIT company", async () => {
    mocks.coreFetch.mockResolvedValue({
      ok: true,
      data: coreFundamentals("standard"),
      diagnostic: providerDiagnostic("SEC Companyfacts", "fundamentals", "available"),
    });

    const result = await fetchCompanyFundamentalsResult(commonCompany);

    expect(result.ok).toBe(true);
    expect(mocks.specializedFetch).not.toHaveBeenCalled();
  });

  it("keeps usable Companyfacts when specialist retrieval fails and appends the failure diagnostic", async () => {
    mocks.coreFetch.mockResolvedValue({
      ok: true,
      data: coreFundamentals("reit"),
      diagnostic: providerDiagnostic("SEC Companyfacts", "fundamentals", "available"),
    });
    mocks.specializedFetch.mockResolvedValue({
      ok: false,
      reason: "empty_response",
      message: "No specialist values.",
      diagnostic: providerDiagnostic("SEC REIT filings", "specialized", "unavailable", "empty_response"),
    });

    const result = await fetchCompanyFundamentalsResult(reitCompany);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.specialized).toBeUndefined();
      expect(result.data.diagnostics?.providerDiagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({ provider: "SEC REIT filings", capability: "specialized", status: "unavailable", reason: "empty_response" }),
      ]));
    }
  });

  it("keeps the exported SEC fundamentals provider wired to the enriched public fetcher", async () => {
    expect(secFundamentalsProvider.fetchFundamentals).toBe(fetchCompanyFundamentalsResult);
  });
});
