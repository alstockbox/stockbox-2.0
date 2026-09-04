import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CompanyFundamentals,
  CompanySearchResult,
  ReitSpecializedMetrics,
} from "../../src/lib/analysis/types";
import { providerDiagnostic } from "../../src/lib/data/providers";

const mocks = vi.hoisted(() => ({
  fetchSecReitSpecializedData: vi.fn(),
}));

vi.mock("../../src/lib/data/sec-reit-specialized-provider", () => ({
  fetchSecReitSpecializedData: mocks.fetchSecReitSpecializedData,
}));

import { enrichSpecializedFundamentals } from "../../src/lib/data/specialized-enrichment";

const reitCompany: CompanySearchResult = {
  ticker: "RTEST",
  canonicalTicker: "RTEST",
  name: "Representative Realty Trust",
  country: "US",
  exchange: "NYSE",
  cik: "0000000001",
  securityType: "Common Stock",
};

function fundamentals(archetype: CompanyFundamentals["analysisArchetype"]): CompanyFundamentals {
  return {
    ticker: "RTEST",
    name: archetype === "reit" ? "Representative Realty Trust" : "Representative Operator",
    cik: "0000000001",
    sector: archetype === "reit" ? "realEstate" : "industrials",
    industry: archetype === "reit" ? "REIT" : "Industrials",
    analysisArchetype: archetype,
    annual: [],
    annualPeriods: [{ fiscalYear: 2025, periodEndDate: "2025-12-31", revenue: 100 }],
    diagnostics: {
      latestFinancialPeriodEnd: "2025-12-31",
      latestAnnualPeriodEnd: "2025-12-31",
      dataAgeDays: null,
      ttmStatus: "annual_fallback",
      providerDiagnostics: [providerDiagnostic("Yahoo Finance fundamentals", "fundamentals", "available")],
      dataStatus: "current",
    },
  };
}

function specialist(): ReitSpecializedMetrics {
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

describe("provider-independent specialist enrichment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enriches Yahoo-resolved REIT fundamentals from SEC filings independently of the core fundamentals provider", async () => {
    mocks.fetchSecReitSpecializedData.mockResolvedValue({
      ok: true,
      data: specialist(),
      diagnostic: providerDiagnostic("SEC REIT filings", "specialized", "available"),
    });

    const result = await enrichSpecializedFundamentals(reitCompany, fundamentals("reit"));

    expect(mocks.fetchSecReitSpecializedData).toHaveBeenCalledTimes(1);
    expect(result.fundamentals.specialized).toMatchObject({
      kind: "reit",
      occupancy: { value: 0.988 },
      sameStoreNoiGrowth: { value: 0.085 },
      netDebtToEbitdare: { value: 5.4 },
      fixedChargeCoverage: { value: 4.7 },
    });
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ provider: "SEC REIT filings", capability: "specialized", status: "available" }),
    ]);
  });

  it("preserves already reported FFO and company-defined AFFO when the SEC exhibit layer has no period-safe replacement", async () => {
    const base = fundamentals("reit");
    base.specialized = {
      ...specialist(),
      fundsFromOperations: { value: 250, unit: "USD", dataAsOf: "2026-06-30" },
      adjustedFundsFromOperations: { value: 220, unit: "USD", dataAsOf: "2026-06-30", companyDefined: true },
      occupancy: { value: null },
    };
    mocks.fetchSecReitSpecializedData.mockResolvedValue({
      ok: true,
      data: specialist(),
      diagnostic: providerDiagnostic("SEC REIT filings", "specialized", "available"),
    });

    const result = await enrichSpecializedFundamentals(reitCompany, base);

    expect(result.fundamentals.specialized).toMatchObject({
      fundsFromOperations: { value: 250 },
      adjustedFundsFromOperations: { value: 220, companyDefined: true },
      occupancy: { value: 0.988 },
    });
  });

  it("does not perform specialist network retrieval for non-REIT fundamentals", async () => {
    const base = fundamentals("standard");
    const result = await enrichSpecializedFundamentals({ ...reitCompany, name: "Representative Operator" }, base);

    expect(result.fundamentals).toBe(base);
    expect(result.diagnostics).toEqual([]);
    expect(mocks.fetchSecReitSpecializedData).not.toHaveBeenCalled();
  });

  it("fails soft when a REIT has no SEC CIK and records the specialist capability as unsupported", async () => {
    const result = await enrichSpecializedFundamentals(
      { ...reitCompany, cik: undefined },
      fundamentals("reit"),
    );

    expect(result.fundamentals.specialized).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        provider: "SEC REIT filings",
        capability: "specialized",
        status: "unsupported",
        reason: "unsupported_symbol",
      }),
    ]);
    expect(mocks.fetchSecReitSpecializedData).not.toHaveBeenCalled();
  });

  it("keeps usable fundamentals when specialist retrieval fails and avoids duplicate SEC specialist requests", async () => {
    const base = fundamentals("reit");
    mocks.fetchSecReitSpecializedData.mockResolvedValueOnce({
      ok: false,
      reason: "upstream_error",
      message: "SEC failed.",
      diagnostic: providerDiagnostic("SEC REIT filings", "specialized", "unavailable", "upstream_error"),
    });

    const failed = await enrichSpecializedFundamentals(reitCompany, base);
    expect(failed.fundamentals).toBe(base);
    expect(failed.diagnostics).toEqual([
      expect.objectContaining({ provider: "SEC REIT filings", capability: "specialized", status: "unavailable", reason: "upstream_error" }),
    ]);

    const alreadyAttempted = fundamentals("reit");
    alreadyAttempted.diagnostics!.providerDiagnostics.push(
      providerDiagnostic("SEC REIT filings", "specialized", "unavailable", "empty_response"),
    );
    const skipped = await enrichSpecializedFundamentals(reitCompany, alreadyAttempted);

    expect(mocks.fetchSecReitSpecializedData).toHaveBeenCalledTimes(1);
    expect(skipped.fundamentals).toBe(alreadyAttempted);
    expect(skipped.diagnostics).toEqual([
      expect.objectContaining({ provider: "SEC REIT filings", capability: "specialized", status: "unavailable", reason: "empty_response" }),
    ]);
  });
});
