import { describe, expect, it } from "vitest";
import type { AnalysisReport } from "../../src/lib/analysis/types";
import { comparisonGroups, objectiveDifferences, reportSearchMatch } from "../../src/lib/analysis/comparison";

function mock(ticker: string, operatingMargin: number, pe: number | null, revenueGrowth: number, overrides: Partial<AnalysisReport> = {}): AnalysisReport {
  return {
    ticker,
    companyName: ticker,
    generatedAt: "2026-08-31T10:00:00Z",
    analysisType: "deep",
    investmentProfile: "balanced",
    greenFlags: [],
    redFlags: [],
    metrics: {} as never,
    score: { score: 60, personalizedScore: 60, confidence: 80, dimensions: [], missingData: [] },
    engine: {
      metrics: {
        margins: { operatingMargin },
        valuation: { priceEarnings: pe },
        growth: { revenueGrowthYoY: revenueGrowth },
      },
    } as never,
    ...overrides,
  } as unknown as AnalysisReport;
}

describe("comparison model", () => {
  it("defines canonical category metric groups without comparison-only financial values", () => {
    expect(comparisonGroups.map((g) => g.id)).toEqual(expect.arrayContaining(["valuation", "growth", "profitability", "financialHealth", "quality"]));
  });

  it("surfaces objective differences without treating the lower P/E as a winner", () => {
    const out = objectiveDifferences([mock("META", .42, 22, .18), mock("GOOGL", .31, 19, .12)]);
    const text = out.join(" ");

    expect(text).toMatch(/META.*higher operating margin/i);
    expect(text).toMatch(/META.*higher revenue growth/i);
    expect(text).not.toMatch(/GOOGL has the lower P\/E/i);
    expect(text).toMatch(/P\/E differs/i);
    expect(text).toMatch(/not treated as better/i);
  });

  it("supports factual stand-out framing across up to five snapshots", () => {
    const out = objectiveDifferences([
      mock("A", .18, 18, .05),
      mock("B", .24, 21, .08),
      mock("C", .31, 25, .12),
      mock("D", .20, null, .04),
      mock("E", .22, 16, .06),
    ]);
    const text = out.join(" ");

    expect(out.length).toBeGreaterThan(0);
    expect(text).toMatch(/C.*highest operating margin/i);
    expect(text).toMatch(/C.*highest revenue growth/i);
    expect(text).not.toMatch(/E.*lowest P\/E/i);
  });

  it("does not invent valuation differences when P/E is missing or N/M", () => {
    const out = objectiveDifferences([mock("LOSS", .2, null, .05), mock("PROFIT", .21, 18, .06)]);
    expect(out.join(" ")).not.toMatch(/P\/E differs/i);
  });

  it("matches saved reports by ticker, company and analysis type", () => {
    const row = { ticker: "META", company_name: "Meta Platforms, Inc.", analysis_type: "deep" };
    expect(reportSearchMatch(row, "Meta Platforms")).toBe(true);
    expect(reportSearchMatch(row, "deep")).toBe(true);
    expect(reportSearchMatch(row, "AAPL")).toBe(false);
  });
});
