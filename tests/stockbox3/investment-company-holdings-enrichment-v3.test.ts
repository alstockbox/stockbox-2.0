import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { EtfHolding } from "../../src/lib/analysis/universal-security";
import type { CompanySearchResult } from "../../src/lib/analysis/types";
import { enrichInvestmentCompanyHoldingsQuality } from "../../src/lib/data/investment-company-holdings-quality";

type HoldingWithIssuerEligibility = EtfHolding & {
  issuerFundamentalsEligible?: boolean;
};

function candidate(name: string, ticker: string): CompanySearchResult {
  return {
    ticker,
    canonicalTicker: ticker,
    name,
    securityType: "Common Stock",
    primarySecurity: true,
    analysisCapability: { fundamentals: "full", marketData: "available" },
    providerCapabilities: { fundamentals: true, marketData: true },
  } as CompanySearchResult;
}

function verifiedFundamentals() {
  return {
    ok: true as const,
    data: {
      roic: 0.14,
      revenueGrowth: 0.08,
      operatingMargin: 0.18,
    },
    source: {
      name: "verified holding fundamentals",
      url: "https://example.test/holding",
      accessedAt: "2026-09-08T09:00:00.000Z",
      freshness: "test",
      provider: "test-provider",
      version: "v1",
      capability: "specialized" as const,
    },
    diagnostic: {
      provider: "test-provider",
      capability: "specialized" as const,
      status: "available" as const,
      observedAt: "2026-09-08T09:00:00.000Z",
    },
  };
}

describe("Investment-company bounded holdings-quality enrichment V3", () => {
  it("searches highest portfolio weights first and stops as soon as verified quality reaches 80%", async () => {
    const holdings: EtfHolding[] = [
      { name: "Alpha", weight: 0.50 },
      { name: "Beta", weight: 0.30 },
      { name: "Gamma", weight: 0.20 },
    ];
    const searches: string[] = [];
    const fetched: string[] = [];

    const result = await enrichInvestmentCompanyHoldingsQuality(holdings, {
      searchCompanies: async (name) => {
        searches.push(name);
        return [candidate(name, `${name.toUpperCase()}.ST`)];
      },
      fetchHoldingFundamentals: async (holding) => {
        fetched.push(holding.ticker ?? "");
        return verifiedFundamentals();
      },
    });

    expect(result.targetReached).toBe(true);
    expect(result.qualityCoveredWeight).toBeCloseTo(0.80, 8);
    expect(result.searchedNames).toEqual(["Alpha", "Beta"]);
    expect(searches).toEqual(["Alpha", "Beta"]);
    expect(fetched).toEqual(["ALPHA.ST", "BETA.ST"]);
    expect(result.budgetExhausted).toBe(false);
  });

  it("never searches holdings explicitly marked ineligible for issuer fundamentals and keeps their weight in the denominator", async () => {
    const holdings: HoldingWithIssuerEligibility[] = [
      { name: "Net receivable / cash", weight: 0.25, issuerFundamentalsEligible: false },
      { name: "Alpha", weight: 0.75, issuerFundamentalsEligible: true },
    ];
    const searches: string[] = [];

    const result = await enrichInvestmentCompanyHoldingsQuality(holdings, {
      searchCompanies: async (name) => {
        searches.push(name);
        return [candidate(name, `${name.toUpperCase()}.ST`)];
      },
      fetchHoldingFundamentals: async () => verifiedFundamentals(),
    });

    expect(searches).toEqual(["Alpha"]);
    expect(result.qualityCoveredWeight).toBeCloseTo(0.75, 8);
    expect(result.targetReached).toBe(false);
    expect(result.budgetExhausted).toBe(false);
  });

  it("caps issuer searches at 12 and fails closed when the quality target is still unmet", async () => {
    const holdings: HoldingWithIssuerEligibility[] = Array.from({ length: 13 }, (_, index) => ({
      name: `Holding ${index + 1}`,
      weight: 1 / 13,
      issuerFundamentalsEligible: true,
    }));

    const result = await enrichInvestmentCompanyHoldingsQuality(holdings, {
      searchCompanies: async (name) => [candidate(name, `${name.replaceAll(" ", "").toUpperCase()}.ST`)],
      fetchHoldingFundamentals: async () => ({
        ...verifiedFundamentals(),
        data: { sector: "Industrials" },
      }),
    });

    expect(result.searchedNames).toHaveLength(12);
    expect(result.attemptedTickers).toHaveLength(12);
    expect(result.qualityCoveredWeight).toBe(0);
    expect(result.targetReached).toBe(false);
    expect(result.budgetExhausted).toBe(true);
  });

  it("wires the bounded enrichment into the investment-company provider without adding another scheduler or queue", () => {
    const provider = readFileSync("src/lib/data/universal-security-provider.ts", "utf8");
    expect(provider).toContain("enrichInvestmentCompanyHoldingsQuality");
    expect(provider).toContain("fetchYahooEtfHoldingFundamentals");
    expect(provider).toContain("fetchHoldingFundamentals: fetchYahooEtfHoldingFundamentals");
    expect(provider).toContain("{ maxSearches: 12 }");
    expect(provider).toContain("investmentHoldings = enrichment.holdings");
    expect(provider).not.toContain("investmentCompanyHoldingsQueue");
    expect(provider).not.toContain("investmentCompanyHoldingsCron");
  });
});
