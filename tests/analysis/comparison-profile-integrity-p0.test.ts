import { describe, expect, it } from "vitest";
import type { AnalysisReport, InvestmentProfile } from "../../src/lib/analysis/types";
import {
  comparisonGroups,
  comparisonLensForProfile,
  comparisonWarnings,
  objectiveDifferences,
  resolveComparisonProfile,
} from "../../src/lib/analysis/comparison";

function mock(input: {
  ticker: string;
  profile?: InvestmentProfile;
  currency?: string;
  archetype?: AnalysisReport["analysisArchetype"];
  pe?: number | null;
  revenueGrowth?: number | null;
  operatingMargin?: number | null;
  roic?: number | null;
  netDebtEbitda?: number | null;
  dividendYield?: number | null;
  dividendCagr5y?: number | null;
  payout?: number | null;
  fcfPayout?: number | null;
}): AnalysisReport {
  return {
    id: input.ticker,
    ticker: input.ticker,
    companyName: input.ticker,
    generatedAt: "2026-08-31T10:00:00Z",
    analysisType: "deep",
    investmentProfile: input.profile ?? "balanced",
    reportingCurrency: input.currency ?? "USD",
    analysisArchetype: input.archetype ?? "standard",
    recommendation: "No Rating",
    greenFlags: [],
    redFlags: [],
    metrics: {} as never,
    score: { score: 60, personalizedScore: 60, confidence: 80, dimensions: [], missingData: [] },
    historical: {
      financials: input.payout === undefined && input.fcfPayout === undefined ? [] : [{
        fiscalYear: 2026,
        payoutRatio: input.payout ?? null,
        freeCashFlowPayoutRatio: input.fcfPayout ?? null,
      } as never],
      price: [],
      dividendCagr3y: null,
      dividendCagr5y: input.dividendCagr5y ?? null,
      dividendCagr10y: null,
      revenueCagr3y: null,
      revenueCagr5y: null,
      revenueCagr10y: null,
      epsCagr3y: null,
      epsCagr5y: null,
      epsCagr10y: null,
      dividendYearsIncreased: 0,
      dividendYearsUnchanged: 0,
      dividendYearsCut: 0,
      valuationContext: {
        currentDividendYield: input.dividendYield ?? null,
      } as never,
    },
    engine: {
      metrics: {
        margins: { operatingMargin: input.operatingMargin ?? null },
        valuation: { priceEarnings: input.pe ?? null },
        growth: { revenueGrowthYoY: input.revenueGrowth ?? null },
        ratios: {
          returnOnInvestedCapital: input.roic ?? null,
          netDebtToEbitda: input.netDebtEbitda ?? null,
        },
      },
    } as never,
  } as unknown as AnalysisReport;
}

describe("comparison profile integrity P0", () => {
  it("defines deterministic metric direction and keeps P/E and dividend yield contextual", () => {
    const valuation = comparisonGroups.find((group) => group.id === "valuation");
    const dividend = comparisonGroups.find((group) => group.id === "dividend");
    const profitability = comparisonGroups.find((group) => group.id === "profitability");

    expect(valuation?.metrics.find((metric) => metric.key === "pe")?.direction).toBe("contextual");
    expect(dividend).toBeDefined();
    expect(dividend?.metrics.find((metric) => metric.key === "dividendYield")?.direction).toBe("contextual");
    expect(dividend?.metrics.find((metric) => metric.key === "dividendCagr5y")?.direction).toBe("higher_is_better");
    expect(profitability?.metrics.find((metric) => metric.key === "operatingMargin")?.direction).toBe("higher_is_better");
  });

  it("changes comparison emphasis by investment profile without changing factual metrics", () => {
    expect(comparisonLensForProfile("dividend").groupOrder.slice(0, 2)).toEqual(["dividend", "financialHealth"]);
    expect(comparisonLensForProfile("growth").groupOrder[0]).toBe("growth");
    expect(comparisonLensForProfile("value").groupOrder[0]).toBe("valuation");
    expect(comparisonLensForProfile("quality").groupOrder[0]).toBe("quality");
    expect(comparisonLensForProfile("defensive").groupOrder[0]).toBe("financialHealth");
  });

  it("uses the shared profile when snapshots match and falls back to balanced for mixed profile snapshots", () => {
    expect(resolveComparisonProfile([mock({ ticker: "A", profile: "growth" }), mock({ ticker: "B", profile: "growth" })])).toEqual({ profile: "growth", mixed: false });
    expect(resolveComparisonProfile([mock({ ticker: "A", profile: "growth" }), mock({ ticker: "B", profile: "value" })])).toEqual({ profile: "balanced", mixed: true });
  });

  it("makes standout statements profile-aware while never calling lower P/E or higher yield a winner", () => {
    const reports = [
      mock({ ticker: "GROW", pe: 28, revenueGrowth: .22, operatingMargin: .16, roic: .12, netDebtEbitda: .5, dividendYield: .01 }),
      mock({ ticker: "MATURE", pe: 17, revenueGrowth: .06, operatingMargin: .31, roic: .24, netDebtEbitda: 2.8, dividendYield: .05 }),
    ];

    const growthText = objectiveDifferences(reports, "en", "growth").join(" ");
    const defensiveText = objectiveDifferences(reports, "en", "defensive").join(" ");
    const valueText = objectiveDifferences(reports, "en", "value").join(" ");
    const dividendText = objectiveDifferences(reports, "en", "dividend").join(" ");

    expect(growthText).toMatch(/GROW.*higher revenue growth/i);
    expect(defensiveText).toMatch(/GROW.*lower net debt \/ EBITDA/i);
    expect(valueText).toMatch(/P\/E differs/i);
    expect(valueText).toMatch(/not treated as better/i);
    expect(dividendText).not.toMatch(/MATURE.*higher dividend yield.*better/i);
    expect(dividendText).not.toMatch(/MATURE.*winner/i);
  });

  it("warns when currency or business archetype makes direct comparison less reliable", () => {
    const warnings = comparisonWarnings([
      mock({ ticker: "BANK", currency: "SEK", archetype: "bank" }),
      mock({ ticker: "SOFT", currency: "USD", archetype: "software_growth" }),
    ]).join(" ");

    expect(warnings).toMatch(/different reporting currencies/i);
    expect(warnings).toMatch(/different business archetypes/i);
  });
});
