import { describe, expect, it } from "vitest";
import { evaluateCoverageSlo, groupCoverageSlo, STOCKBOX_COVERAGE_SLO, type CoverageAuditRecord } from "../../src/lib/analysis/coverage-slo";

function healthy(overrides: Partial<CoverageAuditRecord> = {}): CoverageAuditRecord {
  return {
    status: "completed",
    rating: "Buy",
    score: 78,
    dataCoverage: 1,
    sourceConflicts: [],
    fabricatedCriticalInputs: 0,
    identityVerified: true,
    classificationVerified: true,
    region: "US",
    instrumentType: "common_stock",
    ...overrides,
  };
}

describe("StockBox coverage and integrity SLO", () => {
  it("passes a fully verified universe without weakening integrity gates", () => {
    const result = evaluateCoverageSlo(Array.from({ length: 200 }, () => healthy()));

    expect(result.pass).toBe(true);
    expect(result.metrics).toMatchObject({
      discoveryRate: 1,
      identityRate: 1,
      classificationRate: 1,
      analysisCompletionRate: 1,
      engineErrorRate: 0,
      directionalHighConflictRate: 0,
      scoreRatingMismatchRate: 0,
      fabricatedCriticalInputRate: 0,
    });
  });

  it("fails closed for even one analysis engine error because the integrity target is 100%", () => {
    const records = Array.from({ length: 100 }, () => healthy());
    records[0] = healthy({ status: "analysis_engine_error", rating: null, score: null });

    const result = evaluateCoverageSlo(records);

    expect(result.pass).toBe(false);
    expect(result.metrics.engineErrorRate).toBe(0.01);
    expect(result.violations.some((item) => item.includes("Engine error rate"))).toBe(true);
  });

  it("fails when a directional rating survives an unresolved high-severity source conflict", () => {
    const result = evaluateCoverageSlo([
      healthy({ sourceConflicts: [{ severity: "high", resolved: false }] }),
    ]);

    expect(result.pass).toBe(false);
    expect(result.metrics.directionalHighConflictRate).toBe(1);
  });

  it("requires No Rating to have a null canonical score", () => {
    const result = evaluateCoverageSlo([
      healthy({ rating: "No Rating", score: 72 }),
    ]);

    expect(result.pass).toBe(false);
    expect(result.metrics.scoreRatingMismatchRate).toBe(1);
  });

  it("allows honest No Rating without treating it as an integrity failure", () => {
    const result = evaluateCoverageSlo([
      healthy({ rating: "No Rating", score: null }),
    ]);

    expect(result.pass).toBe(true);
    expect(result.metrics.ratingEligibilityRate).toBe(0);
  });

  it("fails if any critical input was fabricated/defaulted", () => {
    const result = evaluateCoverageSlo([
      healthy({ fabricatedCriticalInputs: 1 }),
    ]);

    expect(result.pass).toBe(false);
    expect(result.metrics.fabricatedCriticalInputRate).toBe(1);
  });

  it("keeps 99%+ availability targets separate from 100% integrity invariants", () => {
    expect(STOCKBOX_COVERAGE_SLO.minimumDiscoveryRate).toBe(0.995);
    expect(STOCKBOX_COVERAGE_SLO.minimumAnalysisCompletionRate).toBe(0.99);
    expect(STOCKBOX_COVERAGE_SLO.maximumEngineErrorRate).toBe(0);
    expect(STOCKBOX_COVERAGE_SLO.maximumScoreRatingMismatchRate).toBe(0);
    expect(STOCKBOX_COVERAGE_SLO.maximumFabricatedCriticalInputRate).toBe(0);
  });

  it("evaluates regions and instrument types independently so strong US coverage cannot hide another market", () => {
    const records = [
      healthy({ region: "US", instrumentType: "common_stock" }),
      healthy({ region: "Nordics", instrumentType: "investment_company", status: "insufficient_fundamentals", rating: null, score: null }),
    ];

    const byRegion = groupCoverageSlo(records, "region", {
      ...STOCKBOX_COVERAGE_SLO,
      minimumDiscoveryRate: 1,
      minimumIdentityRate: 1,
      minimumClassificationRate: 1,
      minimumAnalysisCompletionRate: 1,
    });

    expect(byRegion.US.pass).toBe(true);
    expect(byRegion.Nordics.pass).toBe(false);
  });
});
