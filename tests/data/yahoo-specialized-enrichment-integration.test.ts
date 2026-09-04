import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanyFundamentals, CompanySearchResult } from "../../src/lib/analysis/types";
import { providerDiagnostic } from "../../src/lib/data/providers";

const mocks = vi.hoisted(() => ({
  fetchCoreYahooFundamentalsResult: vi.fn(),
  enrichSpecializedFundamentals: vi.fn(),
}));

vi.mock("../../src/lib/data/yahoo-fundamentals-core", () => ({
  YAHOO_FUNDAMENTALS_CAPABILITIES: {
    supportedCountries: ["global"],
    supportedExchanges: ["Yahoo Finance global catalog"],
    supportsFundamentals: true,
    supportsMarketData: false,
    supportsEstimates: false,
  },
  fetchYahooFundamentalsResult: mocks.fetchCoreYahooFundamentalsResult,
}));

vi.mock("../../src/lib/data/specialized-enrichment", () => ({
  enrichSpecializedFundamentals: mocks.enrichSpecializedFundamentals,
}));

import { fetchYahooFundamentalsResult } from "../../src/lib/data/yahoo-fundamentals";

const company: CompanySearchResult = {
  ticker: "RTEST",
  canonicalTicker: "RTEST",
  name: "Representative Realty Trust",
  cik: "0000000001",
  country: "US",
  exchange: "NYSE",
  securityType: "Common Stock",
};

function baseFundamentals(): CompanyFundamentals {
  const yahooDiagnostic = providerDiagnostic("Yahoo Finance fundamentals", "fundamentals", "available");
  return {
    ticker: "RTEST",
    name: "Representative Realty Trust",
    cik: "0000000001",
    sector: "realEstate",
    industry: "REIT",
    analysisArchetype: "reit",
    annual: [],
    annualPeriods: [{ fiscalYear: 2025, periodEndDate: "2025-12-31", revenue: 100 }],
    diagnostics: {
      latestFinancialPeriodEnd: "2025-12-31",
      latestAnnualPeriodEnd: "2025-12-31",
      dataAgeDays: null,
      ttmStatus: "annual_fallback",
      providerDiagnostics: [yahooDiagnostic],
      dataStatus: "current",
    },
  };
}

describe("Yahoo specialist enrichment wrapper", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes successful Yahoo fundamentals through provider-independent specialist enrichment", async () => {
    const base = baseFundamentals();
    const yahooDiagnostic = providerDiagnostic("Yahoo Finance fundamentals", "fundamentals", "available");
    const specialistDiagnostic = providerDiagnostic("SEC REIT filings", "specialized", "available");
    mocks.fetchCoreYahooFundamentalsResult.mockResolvedValue({ ok: true, data: base, diagnostic: yahooDiagnostic });
    mocks.enrichSpecializedFundamentals.mockResolvedValue({
      fundamentals: {
        ...base,
        specialized: {
          kind: "reit",
          fundsFromOperations: { value: null },
          fundsFromOperationsPerShare: { value: null },
          adjustedFundsFromOperations: { value: null, companyDefined: true },
          adjustedFundsFromOperationsPerShare: { value: null, companyDefined: true },
          fundsFromOperationsGrowth: { value: null },
          adjustedFundsFromOperationsGrowth: { value: null },
          adjustedFundsFromOperationsPayout: { value: null },
          dividendCoverage: { value: null },
          occupancy: { value: 0.988, unit: "ratio" },
          sameStoreNoiGrowth: { value: 0.085, unit: "ratio" },
          netDebtToEbitdare: { value: 5.4, unit: "ratio" },
          debtMaturities: { value: null },
          fixedChargeCoverage: { value: 4.7, unit: "ratio" },
          netAssetValue: { value: null },
        },
      },
      diagnostics: [specialistDiagnostic],
    });

    const result = await fetchYahooFundamentalsResult(company);

    expect(mocks.enrichSpecializedFundamentals).toHaveBeenCalledWith(company, base);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.specialized?.kind).toBe("reit");
      expect(result.data.specialized?.kind === "reit" ? result.data.specialized.occupancy.value : null).toBe(0.988);
      expect(result.data.diagnostics?.providerDiagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({ provider: "Yahoo Finance fundamentals", capability: "fundamentals" }),
        expect.objectContaining({ provider: "SEC REIT filings", capability: "specialized", status: "available" }),
      ]));
    }
  });

  it("does not run specialist enrichment when Yahoo fundamentals fail", async () => {
    const failure = {
      ok: false as const,
      reason: "upstream_error" as const,
      message: "Yahoo failed.",
      diagnostic: providerDiagnostic("Yahoo Finance fundamentals", "fundamentals", "unavailable", "upstream_error"),
    };
    mocks.fetchCoreYahooFundamentalsResult.mockResolvedValue(failure);

    const result = await fetchYahooFundamentalsResult(company);

    expect(result).toBe(failure);
    expect(mocks.enrichSpecializedFundamentals).not.toHaveBeenCalled();
  });

  it("does not duplicate a specialist diagnostic already carried by enriched fundamentals", async () => {
    const base = baseFundamentals();
    const yahooDiagnostic = providerDiagnostic("Yahoo Finance fundamentals", "fundamentals", "available");
    const specialistDiagnostic = providerDiagnostic("SEC REIT filings", "specialized", "unavailable", "empty_response");
    const alreadyEnriched = {
      ...base,
      diagnostics: {
        ...base.diagnostics!,
        providerDiagnostics: [...base.diagnostics!.providerDiagnostics, specialistDiagnostic],
      },
    };
    mocks.fetchCoreYahooFundamentalsResult.mockResolvedValue({ ok: true, data: base, diagnostic: yahooDiagnostic });
    mocks.enrichSpecializedFundamentals.mockResolvedValue({ fundamentals: alreadyEnriched, diagnostics: [specialistDiagnostic] });

    const result = await fetchYahooFundamentalsResult(company);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.diagnostics?.providerDiagnostics.filter((item) => item.provider === "SEC REIT filings")).toHaveLength(1);
    }
  });
});
