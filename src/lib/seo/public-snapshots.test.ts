import { describe, expect, it } from "vitest";
import type { AnalysisReport } from "@/lib/analysis/types";
import { buildPublicSnapshotRecord } from "./public-snapshots";

const baseReport = {
  id: "analysis-1",
  ticker: "MYCR.ST",
  companyName: "Mycronic AB",
  analysisType: "deep",
  investmentProfile: "balanced",
  generatedAt: "2026-09-01T12:00:00.000Z",
  oneSentence: "Source-backed research snapshot.",
  summary: "StockBox research summary.",
  recommendation: "Hold",
  shortTermAssessment: "Neutral.",
  longTermAssessment: "Constructive.",
  metrics: {},
  score: { score: 83, personalizedScore: 83, confidence: 84, dimensions: [], missingData: [] },
  dcf: { suitable: false, bear: null, base: null, bull: null },
  redFlags: [],
  greenFlags: [],
  scenarios: [],
  sources: [],
  disclaimer: "Not individualized financial advice.",
  dataCoverage: 82,
  dataStatus: "current",
  dataAsOf: "2026-08-31T00:00:00.000Z",
  adminQa: { internal: true },
} as unknown as AnalysisReport;

describe("buildPublicSnapshotRecord", () => {
  it("builds an indexable sanitized row from an eligible analysis", () => {
    const row = buildPublicSnapshotRecord({
      analysisId: "analysis-1",
      report: baseReport,
      slug: "mycronic",
      now: "2026-09-01T20:00:00.000Z",
    });

    expect(row.slug).toBe("mycronic");
    expect(row.ticker).toBe("MYCR.ST");
    expect(row.score).toBe(83);
    expect(row.confidence).toBe(0.84);
    expect(row.data_coverage).toBe(0.82);
    expect(row.is_indexable).toBe(true);
    expect((row.report as AnalysisReport).adminQa).toBeUndefined();
  });

  it("throws with quality reasons for an ineligible analysis", () => {
    const report = { ...baseReport, investmentProfile: "growth" } as AnalysisReport;
    expect(() => buildPublicSnapshotRecord({ analysisId: "analysis-1", report, slug: "mycronic" }))
      .toThrow(/balanced_profile_required/);
  });
});
