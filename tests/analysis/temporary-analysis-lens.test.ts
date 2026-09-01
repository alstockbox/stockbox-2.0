import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AnalysisReport, ScoreDimension, ScoreDimensionKey } from "@/lib/analysis/types";
import { ANALYSIS_LENS_PROFILES, applyAnalysisLens } from "@/lib/analysis/analysis-lens";

const keys: ScoreDimensionKey[] = [
  "growth",
  "profitability",
  "financialHealth",
  "valuation",
  "cashFlow",
  "earningsQuality",
  "quality",
  "momentum",
  "risk",
];

function dimension(key: ScoreDimensionKey, score: number | null, coverage = score === null ? 0 : 1): ScoreDimension {
  return {
    key,
    label: key,
    score,
    rawScore: score,
    adjustedScore: score,
    coverage,
    plannedWeight: 1,
    availableWeight: score === null ? 0 : 1,
    weight: 0,
    contributors: [],
  };
}

function reportFixture(): AnalysisReport {
  const scoreByKey: Record<ScoreDimensionKey, number> = {
    growth: 94,
    profitability: 78,
    financialHealth: 72,
    valuation: 24,
    cashFlow: 82,
    earningsQuality: 76,
    quality: 88,
    momentum: 66,
    risk: 70,
  };
  const dimensions = keys.map((key) => dimension(key, scoreByKey[key]));

  return {
    id: "lens-fixture",
    ticker: "LENS",
    companyName: "Lens Test AB",
    analysisType: "deep",
    investmentProfile: "balanced",
    generatedAt: "2026-09-01T12:00:00.000Z",
    oneSentence: "Test report",
    summary: "Test report",
    recommendation: "Hold",
    shortTermAssessment: "Short-term facts stay unchanged.",
    longTermAssessment: "Long-term facts stay unchanged.",
    metrics: {
      revenueGrowth1y: null,
      revenueCagr3y: null,
      epsGrowth1y: null,
      grossMargin: null,
      operatingMargin: null,
      netMargin: null,
      fcf: null,
      fcfMargin: null,
      cashConversion: null,
      debtToEquity: null,
      debtToAssets: null,
      netDebt: null,
      interestCoverage: null,
      earningsYield: null,
      fcfYield: null,
      priceMomentum1y: null,
      priceMomentum3m: null,
    },
    score: {
      score: 70,
      personalizedScore: 70,
      confidence: 82,
      dimensions,
      missingData: [],
    },
    dcf: { suitable: false, bear: null, base: null, bull: null },
    redFlags: [],
    greenFlags: [],
    scenarios: [],
    sources: [],
    disclaimer: "Test",
    engine: {
      modelVersion: "test",
      canonicalInputFingerprint: "fixture",
      reportSchemaVersion: "test",
      analysisArchetype: "standard",
      currencyAlignment: "aligned",
      dataStatus: "current",
      metrics: {} as AnalysisReport["engine"] extends infer E ? E extends { metrics: infer M } ? M : never : never,
      scores: {
        stockBoxScore: 70,
        personalizedScore: 70,
        investmentProfile: "balanced",
        sector: "technology",
        analysisArchetype: "standard",
        confidence: 82,
        confidenceBreakdown: {} as never,
        dataCoverage: 1,
        dimensions: Object.fromEntries(dimensions.map((item) => [item.key, item])) as never,
        shortTermScore: 60,
        longTermScore: 80,
        methodology: {
          modelVersion: "test",
          scorePolicyVersion: "test",
          benchmarkVersion: "test",
          sectorWeights: {} as never,
          personalizedWeights: {} as never,
        },
        missingData: [],
      },
      redFlags: [],
      recommendation: { rating: "Hold", scoreUsed: 70, confidence: 82, rationale: [], constraintsApplied: [], disclosure: "test" },
      dcf: { status: "unavailable", method: "test", low: null, mid: null, high: null, scenarios: [], missingData: [] },
      scenarios: [],
      scenarioStatus: "insufficient_data",
      missingData: [],
      dataCoverage: 1,
      confidenceBreakdown: {} as never,
      diagnostics: {} as never,
      reconciliation: [],
      provenance: {},
      sourceConflicts: [],
    },
  };
}

describe("temporary analysis lens", () => {
  it("offers all supported profiles directly on a report", () => {
    expect(ANALYSIS_LENS_PROFILES).toEqual([
      "balanced",
      "long_term",
      "short_term",
      "growth",
      "value",
      "quality",
      "dividend",
      "defensive",
    ]);
  });

  it("reweights the personalized score without mutating raw facts or the saved profile", () => {
    const source = reportFixture();
    const sourceDimensions = source.score.dimensions;
    const growth = applyAnalysisLens(source, "growth");
    const value = applyAnalysisLens(source, "value");

    expect(source.investmentProfile).toBe("balanced");
    expect(source.score.personalizedScore).toBe(70);
    expect(growth.investmentProfile).toBe("growth");
    expect(value.investmentProfile).toBe("value");
    expect(growth.score.dimensions).toBe(sourceDimensions);
    expect(value.score.dimensions).toBe(sourceDimensions);
    expect(growth.score.personalizedScore).not.toBe(value.score.personalizedScore);
    expect(growth.score.personalizedScore).toBeGreaterThan(value.score.personalizedScore as number);
    expect(growth.engine?.scores.investmentProfile).toBe("growth");
    expect(source.engine?.scores.investmentProfile).toBe("balanced");
  });

  it("treats missing dimensions as missing coverage instead of zero scores", () => {
    const source = reportFixture();
    source.score.dimensions = source.score.dimensions.map((item) =>
      item.key === "valuation" ? dimension("valuation", null, 0) : item,
    );
    if (source.engine) {
      source.engine.scores.dimensions = Object.fromEntries(source.score.dimensions.map((item) => [item.key, item])) as never;
    }

    const value = applyAnalysisLens(source, "value");
    expect(value.score.personalizedScore).not.toBe(0);
    expect(value.score.personalizedScore === null || value.score.personalizedScore >= 0).toBe(true);
  });

  it("renders an explicitly temporary client-side selector in the analysis report", () => {
    const reportView = readFileSync("src/components/analysis/report-view.tsx", "utf8");
    const control = readFileSync("src/components/analysis/analysis-lens-control.tsx", "utf8");

    expect(reportView).toContain('"use client"');
    expect(reportView).toContain("useState<InvestmentProfile>");
    expect(reportView).toContain("applyAnalysisLens");
    expect(reportView).toContain("<AnalysisLensControl");
    expect(control).toContain("does not change");
    expect(control).toContain("ändrar inte");
    expect(control).toContain('aria-pressed={profile === value}');
    expect(control).not.toContain("fetch(");
    expect(control).not.toContain("saveInvestmentProfile");
  });
});
