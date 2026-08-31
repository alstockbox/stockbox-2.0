import { describe, expect, it } from "vitest";
import type { AnalysisReport } from "@/lib/analysis/types";
import { buildCompanyMetricSnapshot } from "./snapshot";

function report(): AnalysisReport {
  return {
    id: "analysis-1",
    ticker: "MSFT",
    companyName: "Microsoft",
    analysisType: "research",
    investmentProfile: "quality",
    generatedAt: "2026-08-31T20:00:00.000Z",
    oneSentence: "Test",
    summary: "Test",
    recommendation: "Hold",
    shortTermAssessment: "Test",
    longTermAssessment: "Test",
    metrics: {
      revenueGrowth1y: 0.1,
      revenueCagr3y: 0.12,
      epsGrowth1y: 0.15,
      grossMargin: 0.68,
      operatingMargin: 0.4,
      netMargin: 0.34,
      fcf: 80,
      fcfMargin: 0.26,
      cashConversion: 1.1,
      debtToEquity: 0.3,
      debtToAssets: 0.2,
      netDebt: -10,
      interestCoverage: 20,
      earningsYield: 0.04,
      fcfYield: 0.035,
      priceMomentum1y: 0.12,
      priceMomentum3m: 0.03,
    },
    score: { score: 82, personalizedScore: 86, confidence: 0.8, dimensions: [], missingData: [] },
    dcf: { suitable: true, bear: 170, base: 200, bull: 230 },
    redFlags: [],
    greenFlags: [],
    scenarios: [],
    sources: [],
    disclaimer: "Research only",
    market: {
      ticker: "MSFT",
      price: 180,
      currency: "USD",
      date: "2026-08-31",
      volume: 1,
      yearHigh: 200,
      yearLow: 120,
      performance: { "1D": 0.02 },
    },
    historical: {
      financials: [
        {
          fiscalYear: 2024,
          periodEndDate: "2024-12-31",
          currency: "USD",
          revenue: 1000,
          revenueGrowth: 0.08,
          eps: 8,
          epsGrowth: 0.1,
          netIncome: 200,
          freeCashFlow: 220,
          freeCashFlowPerShare: 7,
          freeCashFlowMargin: 0.22,
          grossMargin: 0.66,
          operatingMargin: 0.36,
          netMargin: 0.2,
          returnOnEquity: 0.25,
          returnOnAssets: 0.12,
          returnOnInvestedCapital: 0.19,
          cash: 100,
          totalDebt: 80,
          netDebt: -20,
          debtToEquity: 0.2,
          currentRatio: 1.8,
          interestCoverage: 15,
          sharesOutstanding: 100,
          shareGrowth: 0,
          dividendsPaid: 25,
          dividendPerShare: 2.5,
          dividendGrowth: 0.08,
          payoutRatio: 0.25,
          freeCashFlowPayoutRatio: 0.12,
          referencePrice: 150,
          priceEarnings: 20,
          dividendYield: 0.016,
        },
        {
          fiscalYear: 2025,
          periodEndDate: "2025-12-31",
          currency: "USD",
          revenue: 1150,
          revenueGrowth: 0.15,
          eps: 10,
          epsGrowth: 0.25,
          netIncome: 260,
          freeCashFlow: 300,
          freeCashFlowPerShare: 9,
          freeCashFlowMargin: 0.26,
          grossMargin: 0.68,
          operatingMargin: 0.4,
          netMargin: 0.23,
          returnOnEquity: 0.3,
          returnOnAssets: 0.14,
          returnOnInvestedCapital: 0.22,
          cash: 110,
          totalDebt: 70,
          netDebt: -40,
          debtToEquity: 0.16,
          currentRatio: 2,
          interestCoverage: 20,
          sharesOutstanding: 100,
          shareGrowth: 0,
          dividendsPaid: 30,
          dividendPerShare: 3,
          dividendGrowth: 0.2,
          payoutRatio: 0.23,
          freeCashFlowPayoutRatio: 0.1,
          referencePrice: 170,
          priceEarnings: 22,
          dividendYield: 0.017,
        },
      ],
      price: [],
      revenueCagr3y: null,
      revenueCagr5y: null,
      revenueCagr10y: null,
      epsCagr3y: null,
      epsCagr5y: null,
      epsCagr10y: null,
      dividendCagr3y: null,
      dividendCagr5y: null,
      dividendCagr10y: null,
      dividendYearsIncreased: 1,
      dividendYearsUnchanged: 0,
      dividendYearsCut: 0,
    },
    forwardEstimates: { nextYearRevenueGrowth: 0.13, nextYearEpsGrowth: 0.16 },
    engine: {
      modelVersion: "v-test",
      canonicalInputFingerprint: "fingerprint",
      reportSchemaVersion: "schema-test",
      analysisArchetype: "software_growth",
      currencyAlignment: "aligned",
      dataStatus: "current",
      metrics: {
        latestPeriod: null,
        previousPeriod: null,
        margins: { grossMargin: 0.7, operatingMargin: 0.42, ebitdaMargin: 0.45, netMargin: 0.35, freeCashFlowMargin: 0.29, operatingCashFlowMargin: 0.32 },
        growth: { revenueGrowthYoY: 0.11, revenueCagr3y: 0.12, epsGrowthYoY: 0.17, epsCagr3y: 0.14, freeCashFlowGrowthYoY: 0.18, freeCashFlowCagr3y: 0.13, revenueCagr5y: 0.1, freeCashFlowPerShareCagr3y: 0.12, revenueGrowthBasis: "ANNUAL_YOY", freeCashFlowGrowthBasis: "ANNUAL_YOY" },
        ratios: { currentRatio: 2, debtToEquity: 0.2, netDebt: -40, netDebtToEbitda: -0.2, interestCoverage: 20, returnOnEquity: 0.31, returnOnAssets: 0.15, returnOnInvestedCapital: 0.24, cashConversion: 1.1, cashToDebt: 1.5, equityToAssets: 0.5, returnOnInvestedCapitalSpread: 0.15 },
        valuation: { marketCap: 1000, enterpriseValue: 950, priceEarnings: 24, priceSales: 9, priceBook: 10, priceTangibleBook: 12, evSales: 8.5, evEbitda: 19, freeCashFlowYield: 0.04, earningsYield: 0.041, peg: 1.5 },
        trends: { operatingMarginChangeYoY: 0.02, grossMarginChangeYoY: 0.01, revenueAcceleration: 0.01, sharesDilutionYoY: 0 },
        cashFlow: { simpleFreeCashFlow: 320, fcff: 300, fcfe: 310, normalizedTaxRate: 0.2, taxRateSource: "reported_normalized", cfoToNetIncome: 1.2, freeCashFlowToNetIncome: 1.1, accrualRatio: 0.02, stockBasedCompensationToRevenue: 0.03, operatingMarginStability: 0.9, grossMarginStability: 0.95, freeCashFlowStability: 0.85, dividendYield: 0.018, dividendPayoutRatio: 0.24, freeCashFlowPayoutRatio: 0.12, dividendGrowthYoY: 0.09, dividendCagr3y: 0.08 },
        provenance: {},
        missingData: [],
      },
      scores: {
        stockBoxScore: 90,
        personalizedScore: 94,
        investmentProfile: "quality",
        sector: "technology",
        analysisArchetype: "software_growth",
        confidence: 0.91,
        confidenceBreakdown: { dataCoverage: 0.95, dataFreshness: 0.95, sourceQuality: 0.95, reconciliation: 0.95, estimateAvailability: 0.8, valuationInputs: 0.9, entityIdentity: 1, currencyAlignment: 1, archetypeConfidence: 0.95, specializedCoverage: null, marketInputFreshness: 0.95, valuationAssumptions: 0.9, sourceConflict: 1 },
        dataCoverage: 0.95,
        dimensions: {
          growth: { key: "growth", label: "Growth", score: 88, weight: 0.2 },
          profitability: { key: "profitability", label: "Profitability", score: 95, weight: 0.1 },
          financialHealth: { key: "financialHealth", label: "Financial health", score: 92, weight: 0.1 },
          valuation: { key: "valuation", label: "Valuation", score: 74, weight: 0.1 },
          cashFlow: { key: "cashFlow", label: "Cash flow", score: 93, weight: 0.1 },
          earningsQuality: { key: "earningsQuality", label: "Earnings quality", score: 91, weight: 0.1 },
          quality: { key: "quality", label: "Quality", score: 96, weight: 0.1 },
          momentum: { key: "momentum", label: "Momentum", score: 80, weight: 0.1 },
          risk: { key: "risk", label: "Risk", score: 85, weight: 0.1 },
        },
        shortTermScore: 82,
        longTermScore: 92,
        methodology: { modelVersion: "v-test", scorePolicyVersion: "p", benchmarkVersion: "b", sectorWeights: {} as never, personalizedWeights: {} as never },
        missingData: [],
      },
      redFlags: [{ code: "risk-test", label: "Test risk", severity: "medium", rationale: "Test" }],
      recommendation: { rating: "Hold", scoreUsed: 90, confidence: 0.9, rationale: [], constraintsApplied: [], disclosure: "Research" },
      dcf: { status: "available", method: "FCFF", currency: "USD", low: 175, mid: 210, high: 240, scenarios: [], missingData: [], currentPrice: 180, impliedUpside: 0.1667, confidence: 0.8 },
      scenarios: [],
      scenarioStatus: "valuation",
      missingData: [],
      dataCoverage: 0.95,
      confidenceBreakdown: { dataCoverage: 0.95, dataFreshness: 0.95, sourceQuality: 0.95, reconciliation: 0.95, estimateAvailability: 0.8, valuationInputs: 0.9, entityIdentity: 1, currencyAlignment: 1, archetypeConfidence: 0.95, specializedCoverage: null, marketInputFreshness: 0.95, valuationAssumptions: 0.9, sourceConflict: 1 },
      diagnostics: { latestFinancialPeriodEnd: "2025-12-31", latestAnnualPeriodEnd: "2025-12-31", dataAgeDays: 1, ttmStatus: "available", providerDiagnostics: [], dataStatus: "current" },
      reconciliation: [],
      provenance: {},
      sourceConflicts: [],
    },
  };
}

describe("buildCompanyMetricSnapshot", () => {
  it("prefers normalized engine metrics and preserves missing unsupported metrics", () => {
    const snapshot = buildCompanyMetricSnapshot(report());

    expect(snapshot.score).toBe(90);
    expect(snapshot.personalizedScore).toBe(94);
    expect(snapshot.confidence).toBe(0.91);
    expect(snapshot.coverage).toBe(0.95);
    expect(snapshot.valuation.pe).toBe(24);
    expect(snapshot.valuation.forwardPe).toBeNull();
    expect(snapshot.fundamentals.revenueGrowth).toBe(0.11);
    expect(snapshot.fundamentals.operatingMargin).toBe(0.42);
    expect(snapshot.fundamentals.roic).toBe(0.24);
    expect(snapshot.dividend.yield).toBe(0.018);
    expect(snapshot.estimates.revenueGrowth).toBe(0.13);
    expect(snapshot.estimates.targetPrice).toBeNull();
    expect(snapshot.dimensions.quality).toBe(96);
    expect(snapshot.riskFlags[0]?.code).toBe("risk-test");
  });

  it("uses the existing DCF as fair value when no composite override is supplied", () => {
    const snapshot = buildCompanyMetricSnapshot(report());
    expect(snapshot.fairValue).toBe(210);
    expect(snapshot.fairValueLow).toBe(175);
    expect(snapshot.fairValueHigh).toBe(240);
    expect(snapshot.fairValueUpside).toBeCloseTo(210 / 180 - 1);
  });

  it("accepts a validated composite fair value override", () => {
    const snapshot = buildCompanyMetricSnapshot(report(), {
      fairValue: { fairValue: 205, bear: 180, bull: 225 },
    });
    expect(snapshot.fairValue).toBe(205);
    expect(snapshot.fairValueLow).toBe(180);
    expect(snapshot.fairValueHigh).toBe(225);
  });
});
