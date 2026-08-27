import { describe, expect, it } from "vitest";
import {
  analyzeFinancials,
  areInflectionPeriodsComparable,
  computeInflectionResearchScore,
  computeOpportunityScore,
  computeQualityScore,
  type ResearchScore,
} from "../../src/lib/analysis";
import { durableCompounderInput } from "./fixtures";

function contextualScore(score: number): ResearchScore {
  return { score, confidence: 90, coverage: 1, contributors: [], positiveSignals: [], negativeSignals: [] };
}

function currentValuationInput() {
  return {
    ...durableCompounderInput,
    analysisDate: "2026-08-25T00:00:00.000Z",
    market: { ...durableCompounderInput.market, currency: "USD", priceDate: "2026-08-24", marketCapAsOf: "2026-08-24", sharesOutstandingAsOf: "2026-08-24" },
  };
}

describe("research score formulas", () => {
  it("keeps Quality independent from valuation and gates insufficient inputs", () => {
    const result = analyzeFinancials(durableCompounderInput);
    const baseline = computeQualityScore(result);
    const weakerInput = structuredClone(durableCompounderInput);
    Object.assign(weakerInput.annualPeriods.at(-1)!, {
      operatingIncome: 60,
      netIncome: 20,
      operatingCashFlow: 30,
      capitalExpenditures: -25,
      totalDebt: 700,
      totalEquity: 250,
      interestExpense: -45,
    });
    const weaker = computeQualityScore(analyzeFinancials(weakerInput));
    const expensive = structuredClone(result);
    expensive.scores.dimensions.valuation.score = 0;
    expensive.scores.dimensions.valuation.coverage = 1;

    expect(baseline.score).not.toBeNull();
    expect(weaker.score).not.toBeNull();
    expect(baseline.score as number).toBeGreaterThan(weaker.score as number);
    expect(computeQualityScore(expensive).score).toBe(baseline.score);

    const missing = structuredClone(result);
    for (const key of ["profitability", "cashFlow", "earningsQuality", "quality", "financialHealth", "growth"] as const) {
      missing.scores.dimensions[key].score = null;
      missing.scores.dimensions[key].coverage = 0;
      missing.scores.dimensions[key].contributors = [];
    }
    expect(computeQualityScore(missing)).toEqual(expect.objectContaining({ score: null, coverage: 0 }));
  });

  it("lets quality and deterioration constrain an otherwise cheap opportunity", () => {
    const result = analyzeFinancials(currentValuationInput());
    const market = { ticker: "BOX", price: 30, currency: "USD", date: "2026-08-23", volume: null, yearHigh: 45, yearLow: 20, performance: { "3M": 0.1 } };
    const healthy = computeOpportunityScore(result, contextualScore(85), contextualScore(75), market);
    const deteriorating = computeOpportunityScore(result, contextualScore(20), contextualScore(20), market);

    expect(healthy.score).not.toBeNull();
    expect(deteriorating.score).not.toBeNull();
    expect(healthy.score as number).toBeGreaterThan(deteriorating.score as number);
  });

  it("does not replace unsuitable DCF and missing valuation with a neutral score", () => {
    const result = structuredClone(analyzeFinancials(durableCompounderInput));
    result.dcf = { ...result.dcf, status: "inappropriate", reason: "DCF is unsuitable for this archetype.", low: null, mid: null, high: null, scenarios: [] };
    result.scores.dimensions.valuation.score = null;
    result.scores.dimensions.valuation.coverage = 0;
    const opportunity = computeOpportunityScore(result, contextualScore(80), contextualScore(70), null);
    const coveredResult = analyzeFinancials(currentValuationInput());
    const covered = computeOpportunityScore(coveredResult, contextualScore(80), contextualScore(70), {
      ticker: "BOX", price: 30, currency: "USD", date: "2026-08-23", volume: null, yearHigh: 45, yearLow: 20, performance: {},
    });

    expect(opportunity.score).toBeNull();
    expect(opportunity.confidence).toBeLessThan(covered.confidence);
    expect(opportunity.contributors.find((item) => item.key === "dcf")).toEqual(expect.objectContaining({ status: "unsuitable", score: null }));
  });

  it("does not use low-confidence DCF as an opportunity signal", () => {
    const result = structuredClone(analyzeFinancials(currentValuationInput()));
    result.dcf = { ...result.dcf, confidence: 35 };
    const opportunity = computeOpportunityScore(result, contextualScore(80), contextualScore(70), {
      ticker: "BOX", price: 30, currency: "USD", date: "2026-08-23", volume: null, yearHigh: 45, yearLow: 20, performance: {},
    });

    expect(opportunity.contributors.find((item) => item.key === "dcf")).toEqual(expect.objectContaining({
      status: "missing",
      score: null,
      reason: "DCF confidence is too low for opportunity scoring.",
    }));
  });

  it("detects multi-signal improvement and negative-to-positive free cash flow", () => {
    const input = structuredClone(durableCompounderInput);
    const prior = input.annualPeriods.find((period) => period.fiscalYear === 2023)!;
    prior.operatingCashFlow = 20;
    prior.capitalExpenditures = -60;
    const result = analyzeFinancials(input);
    const inflection = computeInflectionResearchScore(result, input);

    expect(inflection.score).not.toBeNull();
    expect(inflection.positiveSignals.length).toBeGreaterThanOrEqual(3);
    expect(inflection.positiveSignals).toEqual(expect.arrayContaining([
      expect.objectContaining({ metric: "freeCashFlow", statement: "Free cash flow changed from negative to positive." }),
      expect.objectContaining({ metric: "operatingMargin" }),
      expect.objectContaining({ metric: "revenueGrowthAcceleration" }),
    ]));
  });

  it("scores broad financial deterioration negatively", () => {
    const input = structuredClone(durableCompounderInput);
    Object.assign(input.annualPeriods.at(-1)!, {
      revenue: 900,
      operatingIncome: 90,
      netIncome: 35,
      operatingCashFlow: 45,
      capitalExpenditures: -40,
      interestExpense: -35,
    });
    const inflection = computeInflectionResearchScore(analyzeFinancials(input), input);

    expect(inflection.score).not.toBeNull();
    expect(inflection.score as number).toBeLessThan(50);
    expect(inflection.negativeSignals.length).toBeGreaterThanOrEqual(3);
  });

  it("rejects mismatched annual and TTM periods instead of manufacturing a trend", () => {
    expect(areInflectionPeriodsComparable(
      { form: "TTM", periodBasis: "TTM_Q3_9M", currentYtdDurationDays: 270 },
      { form: "10-K", fiscalYear: 2024 },
    )).toBe(false);

    const result = structuredClone(analyzeFinancials(durableCompounderInput));
    result.metrics.latestPeriod = { ...result.metrics.latestPeriod!, form: "TTM", periodBasis: "TTM_Q3_9M", currentYtdDurationDays: 270 };
    result.metrics.previousPeriod = { ...result.metrics.previousPeriod!, form: "10-K" };
    expect(computeInflectionResearchScore(result, durableCompounderInput).score).toBeNull();

    result.metrics.latestPeriod = null;
    result.metrics.previousPeriod = null;
    expect(computeInflectionResearchScore(result, { ...durableCompounderInput, annualPeriods: [] }).score).toBeNull();
  });
});
