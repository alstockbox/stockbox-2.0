import { describe, expect, it } from "vitest";
import type { AnalysisReport } from "../../src/lib/analysis/types";
import { comparisonGroups, objectiveDifferences, reportSearchMatch } from "../../src/lib/analysis/comparison";

function mock(ticker: string, operatingMargin: number, pe: number, revenueGrowth: number): AnalysisReport {
  return { ticker, companyName: ticker, generatedAt: "2026-08-31T10:00:00Z", analysisType: "deep", investmentProfile: "balanced",
    greenFlags: [], redFlags: [], metrics: {} as never, score: { score: 60, personalizedScore: 60, confidence: 80, dimensions: [], missingData: [] },
    engine: { metrics: { margins: { operatingMargin }, valuation: { priceEarnings: pe }, growth: { revenueGrowthYoY: revenueGrowth } } } as never
  } as unknown as AnalysisReport;
}

describe("comparison model", () => {
  it("defines canonical category metric groups without comparison-only financial values", () => {
    expect(comparisonGroups.map((g) => g.id)).toEqual(expect.arrayContaining(["valuation","growth","profitability","financialHealth","quality"]));
  });
  it("creates objective differences only from available canonical numbers", () => {
    const out = objectiveDifferences([mock("META", .42, 22, .18), mock("GOOGL", .31, 19, .12)]);
    expect(out.join(" ")).toMatch(/META.*higher operating margin/i);
    expect(out.join(" ")).toMatch(/GOOGL.*lower P\/E/i);
    expect(out.join(" ")).toMatch(/META.*higher revenue growth/i);
  });
  it("matches saved reports by ticker, company and analysis type", () => {
    const row = { ticker: "META", company_name: "Meta Platforms, Inc.", analysis_type: "deep" };
    expect(reportSearchMatch(row, "Meta Platforms")).toBe(true);
    expect(reportSearchMatch(row, "deep")).toBe(true);
    expect(reportSearchMatch(row, "AAPL")).toBe(false);
  });
});
