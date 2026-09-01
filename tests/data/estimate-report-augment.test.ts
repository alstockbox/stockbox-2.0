import { describe, expect, it } from "vitest";
import { buildAnalysis, type AnalysisInput } from "../../src/lib/analysis";
import { applyTwelveDataEstimateSnapshot } from "../../src/lib/data/estimate-report-augment";
import type { TwelveDataEstimateSnapshot } from "../../src/lib/data/twelve-data-estimates";
import { durableCompounderInput } from "../analysis/fixtures";

function report() {
  const input: AnalysisInput = {
    company: { ticker: "BOX", name: "Box Systems", country: "US", currency: "USD" },
    analysisType: "research",
    investmentProfile: "balanced",
    market: { ticker: "BOX", price: 30, currency: "USD", date: "2026-08-31", volume: 1000, yearHigh: 35, yearLow: 20, performance: {}, provider: "fixture" },
    fundamentals: {
      ticker: "BOX", name: "Box Systems", sector: "technology", industry: "Cloud software",
      annual: [], annualPeriods: durableCompounderInput.annualPeriods, reportingCurrency: "USD",
    },
    analysisDate: "2026-08-31T00:00:00.000Z",
  };
  return buildAnalysis(input);
}

const snapshot: TwelveDataEstimateSnapshot = {
  forwardEstimates: {
    nextYearRevenueGrowth: 0.12,
    nextYearEpsGrowth: 0.2,
    nextYearFreeCashFlowGrowth: null,
  },
  earningsConsensus: [
    { date: "2026-08-31", period: "current_year", analystCount: 20, average: 5, low: 4.5, high: 5.5 },
    { date: "2026-08-31", period: "next_year", analystCount: 18, average: 6, low: 5.2, high: 6.8 },
  ],
  revenueConsensus: [
    { date: "2026-08-31", period: "current_year", analystCount: 20, average: 100, low: 95, high: 105 },
    { date: "2026-08-31", period: "next_year", analystCount: 18, average: 112, low: 105, high: 120 },
  ],
  epsRevisions: [
    { date: "2026-08-31", period: "next_year", upLastWeek: 2, upLastMonth: 7, downLastWeek: 1, downLastMonth: 2, netLastWeek: 1, netLastMonth: 5 },
  ],
  currency: "USD",
  coverage: 1,
};

describe("analyst estimate report enrichment", () => {
  it("attaches forward estimates, provenance, research coverage and revision signals", () => {
    const result = report();
    const originalCoverage = result.research?.coverage ?? 0;
    const source = applyTwelveDataEstimateSnapshot(result, snapshot);

    expect(result.forwardEstimates).toEqual(expect.objectContaining({
      nextYearRevenueGrowth: 0.12,
      nextYearEpsGrowth: 0.2,
    }));
    expect(source.capability).toBe("estimates");
    expect(source.dataAsOf).toBe("2026-08-31");

    const layer = result.research?.layers.find((item) => item.layer === "earnings_expectations");
    expect(layer).toEqual(expect.objectContaining({ status: "available", coverage: 1, dataAsOf: "2026-08-31" }));
    expect(result.research?.coverage).toBeGreaterThan(originalCoverage);

    const analystModule = result.research?.modules.find((item) => item.id === "analyst_expectations");
    expect(analystModule?.status).toBe("available");
    expect(analystModule?.findings.some((item) => item.statement.includes("Next-year EPS consensus growth"))).toBe(true);

    const revision = result.research?.signals.find((item) => item.metric === "epsRevisionNetLastMonth");
    expect(revision).toEqual(expect.objectContaining({ direction: "positive", current: 5 }));
    expect(result.research?.positives.some((item) => item.id === revision?.id)).toBe(true);
    expect(result.research?.evidence.some((item) => item.source.provider === "twelve-data-estimates")).toBe(true);
  });

  it("does not fabricate a revision direction when revisions are balanced", () => {
    const result = report();
    applyTwelveDataEstimateSnapshot(result, {
      ...snapshot,
      epsRevisions: [{ ...snapshot.epsRevisions[0]!, upLastMonth: 2, downLastMonth: 2, netLastMonth: 0 }],
    });

    expect(result.research?.signals.some((item) => item.metric === "epsRevisionNetLastMonth")).toBe(false);
    const analystModule = result.research?.modules.find((item) => item.id === "analyst_expectations");
    expect(analystModule?.positiveSignals).toEqual([]);
    expect(analystModule?.negativeSignals).toEqual([]);
  });
});
