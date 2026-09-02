import { describe, expect, it } from "vitest";
import type { AnalysisReport } from "@/lib/analysis/types";
import { buildIntelligenceSnapshot } from "@/lib/analysis/intelligence-snapshot";

function reportFixture(): AnalysisReport {
  return {
    id: "analysis-1", ticker: "TEST", companyName: "Test Company", analysisType: "deep", investmentProfile: "balanced",
    generatedAt: "2026-09-01T20:00:00.000Z", oneSentence: "Test", summary: "Test", recommendation: "Buy", shortTermAssessment: "Test", longTermAssessment: "Test",
    metrics: { revenueGrowth1y: 0.24, revenueCagr3y: 0.15, epsGrowth1y: 0.3, grossMargin: 0.55, operatingMargin: 0.2, netMargin: 0.16, fcf: 200, fcfMargin: 0.17, cashConversion: 1.08, debtToEquity: 0.4, debtToAssets: 0.2, netDebt: -50, interestCoverage: 14, earningsYield: 0.065, fcfYield: 0.07, priceMomentum1y: 0.28, priceMomentum3m: 0.16 },
    score: { score: 78, personalizedScore: 80, confidence: 91, dimensions: [
      { key: "valuation", label: "Valuation", score: 84, weight: 0.12 }, { key: "financialHealth", label: "Financial health", score: 86, weight: 0.12 },
      { key: "growth", label: "Growth", score: 88, weight: 0.13 }, { key: "momentum", label: "Momentum", score: 72, weight: 0.08 },
    ], missingData: [] },
    dcf: { suitable: true, bear: 98, base: 145, bull: 180 }, redFlags: [], greenFlags: [], scenarios: [], sources: [], disclaimer: "Test",
    dataCoverage: 0.92, reportingCurrency: "USD",
    market: { ticker: "TEST", price: 100, currency: "USD", date: "2026-08-31", volume: 1_000_000, yearHigh: 112, yearLow: 56, performance: { "1M": 0.07, "3M": 0.16, "6M": 0.22, "1Y": 0.28 } },
    historical: { financials: [
      { fiscalYear: 2024, periodEndDate: "2024-12-31", currency: "USD", revenue: 1000, revenueGrowth: 0.11, eps: 4, epsGrowth: 0.09, netIncome: 140, freeCashFlow: 120, freeCashFlowPerShare: 1.2, freeCashFlowMargin: 0.12, grossMargin: 0.51, operatingMargin: 0.14, netMargin: 0.14, returnOnEquity: 0.17, returnOnAssets: 0.1, returnOnInvestedCapital: 0.13, cash: 300, totalDebt: 150, netDebt: -150, debtToEquity: 0.45, currentRatio: 1.8, interestCoverage: 10, sharesOutstanding: 100, shareGrowth: 0.02, dividendsPaid: 20, dividendPerShare: 0.2, dividendGrowth: 0.05, payoutRatio: 0.14, freeCashFlowPayoutRatio: 0.17, referencePrice: 78, priceEarnings: 19.5, dividendYield: 0.0026 },
      { fiscalYear: 2025, periodEndDate: "2025-12-31", currency: "USD", revenue: 1240, revenueGrowth: 0.24, eps: 5.2, epsGrowth: 0.3, netIncome: 190, freeCashFlow: 210, freeCashFlowPerShare: 2.08, freeCashFlowMargin: 0.17, grossMargin: 0.55, operatingMargin: 0.2, netMargin: 0.153, returnOnEquity: 0.22, returnOnAssets: 0.13, returnOnInvestedCapital: 0.18, cash: 360, totalDebt: 145, netDebt: -215, debtToEquity: 0.4, currentRatio: 2.0, interestCoverage: 14, sharesOutstanding: 101, shareGrowth: 0.01, dividendsPaid: 23, dividendPerShare: 0.23, dividendGrowth: 0.15, payoutRatio: 0.12, freeCashFlowPayoutRatio: 0.11, referencePrice: 100, priceEarnings: 19.23, dividendYield: 0.0023 },
    ], price: [], valuationContext: { currentPriceEarnings: 15, referenceWindow: "5Y", referencePriceEarningsMedian: 24, fiveYear: { observationCount: 60 } } as never, revenueCagr3y: 0.15, revenueCagr5y: null, revenueCagr10y: null } as never,
    forwardEstimates: { nextYearRevenueGrowth: 0.19, nextYearEpsGrowth: 0.25 }, dataAsOf: "2026-08-31", dataStatus: "current",
    research: { positives: [], negatives: [], changes: [], signals: [], evidence: [], layers: [], modules: [], diagnostics: [] } as never,
  } as AnalysisReport;
}

describe("buildIntelligenceSnapshot", () => {
  it("derives mispricing and inflection from existing report data without mutation", () => {
    const report = reportFixture(); const before = structuredClone(report); const snapshot = buildIntelligenceSnapshot(report, "balanced");
    expect(snapshot.mispricing.score).not.toBeNull();
    expect(snapshot.mispricing.pillars.find((pillar) => pillar.id === "historical_self_valuation")?.score).not.toBeNull();
    expect(snapshot.inflection.score).not.toBeNull();
    expect(snapshot.inflection.signals.find((signal) => signal.id === "expectations")?.score).not.toBeNull();
    expect(snapshot.opportunity.score).not.toBeNull(); expect(report).toEqual(before);
  });

  it("changes only the opportunity interpretation when the analysis lens changes", () => {
    const report = reportFixture(); const value = buildIntelligenceSnapshot(report, "value"); const shortTerm = buildIntelligenceSnapshot(report, "short_term");
    expect(value.mispricing).toEqual(shortTerm.mispricing); expect(value.inflection).toEqual(shortTerm.inflection);
    expect(value.canonicalCoreScore).toBe(shortTerm.canonicalCoreScore); expect(value.opportunity.profile).toBe("value"); expect(shortTerm.opportunity.profile).toBe("short_term");
  });

  it("activates the fragile gate when the report has a critical red flag", () => {
    const report = reportFixture(); report.redFlags = [{ severity: "critical", title: "Liquidity runway", detail: "Critical funding risk." }];
    const snapshot = buildIntelligenceSnapshot(report, "short_term"); expect(snapshot.inflection.stage).toBe("fragile"); expect(snapshot.inflection.score as number).toBeLessThanOrEqual(35);
  });
});
