import { describe, expect, it } from "vitest";
import { buildAnalysis, type AnalysisInput } from "../../src/lib/analysis";
import { buildAnalystExpectationsSummary } from "../../src/lib/analysis/analyst-expectations";
import { durableCompounderInput } from "./fixtures";

function input(estimates?: AnalysisInput["estimates"]): AnalysisInput {
  return {
    company: { ticker: "BOX", name: "Box Systems", country: "US", currency: "USD" },
    analysisType: "research",
    investmentProfile: "balanced",
    market: { ticker: "BOX", price: 30, currency: "USD", date: "2026-08-31", volume: 1000, yearHigh: 35, yearLow: 20, performance: {}, provider: "fixture" },
    fundamentals: {
      ticker: "BOX", name: "Box Systems", sector: "technology", industry: "Cloud software",
      annual: [], annualPeriods: durableCompounderInput.annualPeriods, reportingCurrency: "USD",
    },
    estimates,
    analysisDate: "2026-08-31T00:00:00.000Z",
  };
}

describe("analyst expectations summary", () => {
  it("preserves configured forward estimates on the finished report", () => {
    const report = buildAnalysis(input({ nextYearRevenueGrowth: 0.12, nextYearEpsGrowth: 0.18, nextYearFreeCashFlowGrowth: null }));
    const summary = buildAnalystExpectationsSummary(report);

    expect(report.forwardEstimates?.nextYearRevenueGrowth).toBe(0.12);
    expect(summary.status).toBe("available");
    expect(summary.rows.find((row) => row.key === "nextYearEpsGrowth")?.value).toBe(0.18);
    expect(summary.missingReasons).toContain("Next-year FCF growth: estimate unavailable.");
  });

  it("fails closed when no estimates are configured", () => {
    const summary = buildAnalystExpectationsSummary(buildAnalysis(input()));

    expect(summary.status).toBe("unavailable");
    expect(summary.rows.every((row) => row.status === "unavailable")).toBe(true);
    expect(summary.rows[0]?.note).toContain("does not infer it from historical data");
  });
});
