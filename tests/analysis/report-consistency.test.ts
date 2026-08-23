import { describe, expect, it } from "vitest";
import { buildAnalysis, type AnalysisInput } from "../../src/lib/analysis";
import { durableCompounderInput } from "./fixtures";

function legacyInput(analysisType: AnalysisInput["analysisType"]): AnalysisInput {
  return {
    company: { ticker: "BOX", name: "Box Systems", country: "US", exchange: "Nasdaq" },
    analysisType,
    investmentProfile: "growth",
    market: {
      ticker: "BOX",
      price: 30,
      currency: "USD",
      date: "2025-01-02",
      volume: 1000,
      yearHigh: 35,
      yearLow: 20,
      performance: { "3M": 0.1, "1Y": 0.38 },
    },
    fundamentals: {
      ticker: "BOX",
      name: "Box Systems",
      sector: "technology",
      industry: "Cloud software",
      analysisArchetype: "software_growth",
      annual: durableCompounderInput.annualPeriods.map((period) => ({
        fiscalYear: period.fiscalYear as number,
        revenue: period.revenue ?? null,
        grossProfit: period.grossProfit ?? null,
        operatingIncome: period.operatingIncome ?? null,
        netIncome: period.netIncome ?? null,
        epsDiluted: period.epsDiluted ?? null,
        operatingCashFlow: period.operatingCashFlow ?? null,
        capex: period.capitalExpenditures ?? null,
        assets: period.totalAssets ?? null,
        liabilities: period.totalLiabilities ?? null,
        cash: period.cashAndEquivalents ?? null,
        debt: period.totalDebt ?? null,
        equity: period.totalEquity ?? null,
        interestExpense: period.interestExpense ?? null,
        ebitda: period.ebitda,
        currentAssets: period.currentAssets,
        currentLiabilities: period.currentLiabilities,
        sharesDiluted: period.sharesDiluted,
      })),
    },
  };
}

describe("report depth consistency", () => {
  it("keeps canonical metrics and scores identical across every report depth", () => {
    const summary = buildAnalysis(legacyInput("summary"));
    const numbers = buildAnalysis(legacyInput("numbers"));
    const deep = buildAnalysis(legacyInput("deep"));
    const research = buildAnalysis(legacyInput("research"));
    expect(summary.metrics).toEqual(numbers.metrics);
    expect(numbers.metrics).toEqual(deep.metrics);
    expect(summary.score.score).toBe(numbers.score.score);
    expect(numbers.score.score).toBe(deep.score.score);
    expect(deep.metrics).toEqual(research.metrics);
    expect(deep.score.score).toBe(research.score.score);
    expect(deep.deepReport?.sections).toHaveLength(27);
    expect(research.research?.modules).toHaveLength(15);
    expect(summary.engine?.modelVersion).toBe("stockbox-analysis-engine-v1.0.0");
  });
});
