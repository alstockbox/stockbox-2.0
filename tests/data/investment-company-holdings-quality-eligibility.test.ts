import { describe, expect, it, vi } from "vitest";

import type { EtfHolding } from "../../src/lib/analysis/universal-security";
import type { CompanySearchResult } from "../../src/lib/analysis/types";
import { enrichInvestmentCompanyHoldingsQuality } from "../../src/lib/data/investment-company-holdings-quality";

type HoldingWithIssuerEligibility = EtfHolding & {
  issuerFundamentalsEligible?: boolean;
};

describe("investment-company holdings quality issuer eligibility", () => {
  it("keeps non-issuer exposures in the denominator without sending them through issuer search or fundamentals", async () => {
    const holdings: HoldingWithIssuerEligibility[] = [
      { name: "Listed Alpha", weight: 0.40 },
      { name: "Private real estate", weight: 0.20, issuerFundamentalsEligible: false },
      { name: "Listed Beta", weight: 0.30 },
      { name: "Aggregate securities", weight: 0.10, issuerFundamentalsEligible: false },
    ];

    const searchCompanies = vi.fn(async (query: string): Promise<CompanySearchResult[]> => [{
      ticker: "FAKE.ST",
      canonicalTicker: "FAKE.ST",
      name: query,
      securityType: "Common Stock",
    }]);
    const fetchHoldingFundamentals = vi.fn(async (holding: EtfHolding) => {
      void holding;
      return {
        ok: false as const,
        message: "fixture unavailable",
        diagnostic: {
          provider: "Fixture holding fundamentals",
          capability: "specialized" as const,
          status: "unavailable" as const,
          reason: "fixture_unavailable",
          observedAt: "2026-09-07T11:50:00.000Z",
        },
      };
    });

    const result = await enrichInvestmentCompanyHoldingsQuality(
      holdings,
      { searchCompanies, fetchHoldingFundamentals },
      { maxSearches: 12 },
    );

    expect(result.qualityCoveredWeight).toBe(0);
    expect(result.targetReached).toBe(false);
    expect(result.holdings.reduce((sum, holding) => sum + holding.weight, 0)).toBeCloseTo(1, 12);
    expect(result.searchedNames).toEqual(["Listed Alpha", "Listed Beta"]);
    expect(searchCompanies).not.toHaveBeenCalledWith("Private real estate");
    expect(searchCompanies).not.toHaveBeenCalledWith("Aggregate securities");
    expect(fetchHoldingFundamentals.mock.calls.some(([holding]) => holding.name === "Private real estate")).toBe(false);
    expect(fetchHoldingFundamentals.mock.calls.some(([holding]) => holding.name === "Aggregate securities")).toBe(false);
  });
});
