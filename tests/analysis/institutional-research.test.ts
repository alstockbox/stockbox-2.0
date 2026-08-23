import { describe, expect, it } from "vitest";
import {
  analyzeFinancials,
  analyzeInsiderTransactions,
  buildAnalysis,
  buildBatchQaResult,
  classifyMaterialNews,
  computeInflectionScore,
  type AnalysisInput,
  type ResearchEvidence,
} from "../../src/lib/analysis";
import { durableCompounderInput, missingDataInput } from "./fixtures";

function legacy(analysisType: AnalysisInput["analysisType"], archetype: NonNullable<AnalysisInput["fundamentals"]>["analysisArchetype"] = "standard"): AnalysisInput {
  return {
    company: { ticker: "TEST", canonicalTicker: "TEST", entityId: "economic-company:test", name: "Test Inc.", country: "US", currency: "USD" },
    analysisType,
    investmentProfile: "balanced",
    market: { ticker: "TEST", price: 20, currency: "USD", date: "2026-08-20", volume: 100, yearHigh: 25, yearLow: 12, performance: {} },
    fundamentals: {
      ticker: "TEST", name: "Test Inc.", sector: archetype === "reit" ? "realEstate" : "technology", industry: null, analysisArchetype: archetype,
      annual: durableCompounderInput.annualPeriods.map((period) => ({ fiscalYear: period.fiscalYear!, revenue: period.revenue ?? null, grossProfit: period.grossProfit ?? null, operatingIncome: period.operatingIncome ?? null, netIncome: period.netIncome ?? null, epsDiluted: period.epsDiluted ?? null, operatingCashFlow: period.operatingCashFlow ?? null, capex: period.capitalExpenditures ?? null, assets: period.totalAssets ?? null, liabilities: period.totalLiabilities ?? null, cash: period.cashAndEquivalents ?? null, debt: period.totalDebt ?? null, equity: period.totalEquity ?? null, interestExpense: period.interestExpense ?? null })),
    },
  };
}

const evidence: ResearchEvidence = {
  id: "filing-1", kind: "reported_fact", sourceTier: "regulatory_filing", title: "Company filing",
  source: { name: "SEC filing", url: "https://www.sec.gov/", accessedAt: "2026-08-20", freshness: "current" },
};

describe("institutional research architecture", () => {
  it("does not award a generic strong operating-margin flag to a REIT", () => {
    const report = buildAnalysis(legacy("deep", "reit"));
    expect(report.greenFlags.map((flag) => flag.title)).not.toContain("Strong operating margin");
  });

  it("gates scenarios when rating, coverage and valuation are unavailable", () => {
    const result = analyzeFinancials(missingDataInput);
    expect(result.recommendation.rating).toBe("No Rating");
    expect(result.scenarioStatus).toBe("insufficient_data");
    expect(result.scenarios).toEqual([]);
  });

  it("classifies material events using evidence quality without changing a rating", () => {
    expect(classifyMaterialNews("Company raises guidance after earnings", evidence)).toEqual(expect.objectContaining({ eventType: "guidance_raise", direction: "positive", materiality: "high", confidence: 85, affectedFinancialDriver: "forward earnings" }));
  });

  it("separates automatic insider sales from discretionary cluster activity", () => {
    const result = analyzeInsiderTransactions([
      { transactionType: "automatic_plan", insiderRole: "CEO", shares: 10, value: 100, ownershipChange: -0.01, date: "2026-08-01", automaticPlan: true },
      { transactionType: "open_market_buy", insiderRole: "CFO", shares: 20, value: 200, ownershipChange: 0.02, date: "2026-08-02", automaticPlan: false },
      { transactionType: "open_market_buy", insiderRole: "Director", shares: 30, value: 300, ownershipChange: 0.03, date: "2026-08-03", automaticPlan: false },
    ]);
    expect(result).toEqual(expect.objectContaining({ direction: "positive", clusterBuying: true, clusterSelling: false }));
  });

  it("reports inflection as unknown rather than manufacturing signals", () => {
    const result = analyzeFinancials(missingDataInput);
    const inflection = computeInflectionScore(result.metrics);
    expect(inflection.inflectionScore === null || inflection.confidence < 50).toBe(true);
  });

  it("creates rerunnable QA metadata and specialized-data flags", () => {
    const report = buildAnalysis(legacy("research", "reit"));
    const qa = buildBatchQaResult({ batchId: "daily-25", rerunKey: "daily-25:2026-08-23", report, analysisInput: { ...durableCompounderInput, company: { ...durableCompounderInput.company, entityId: "economic-company:test", analysisArchetype: "reit" } } });
    expect(qa.rerunKey).toBe("daily-25:2026-08-23");
    expect(qa.flags).toContain("SPECIALIZED_DATA_MISSING");
    expect(qa.modelVersion).toBe(report.modelVersion);
  });
});
