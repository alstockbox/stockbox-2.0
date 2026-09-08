import { describe, expect, it } from "vitest";
import { buildGlobalAuditKpis } from "../../scripts/diagnostics/user-large-ticker-kpis";

describe("global ticker audit KPIs", () => {
  it("measures coverage target, rating rate, no-rating rate, and rating-gate integrity", () => {
    const kpis = buildGlobalAuditKpis([
      {
        query: "ETF1",
        status: "completed",
        securityType: "ETF/Fund",
        market: "US",
        specialist: true,
        coverage: 1,
        score: 82,
        rating: "Buy",
      },
      {
        query: "ETF2",
        status: "completed",
        securityType: "ETF/Fund",
        market: "US",
        specialist: true,
        coverage: 0.98,
        score: 74,
        rating: "No Rating",
      },
      {
        query: "INV-B.ST",
        status: "completed",
        securityType: "Common Stock",
        market: "ST",
        specialist: true,
        coverage: 0.99,
        score: 76,
        rating: "No Rating",
      },
      {
        query: "BAD1",
        status: "completed",
        securityType: "ETF/Fund",
        market: "L",
        specialist: true,
        coverage: 0.7,
        score: 65,
        rating: "Hold",
      },
      {
        query: "ORD1",
        status: "completed",
        securityType: "Common Stock",
        market: "US",
        specialist: false,
        coverage: 0.88,
        score: 68,
        rating: "Hold",
      },
      {
        query: "MISS",
        status: "provider_data_unavailable",
        securityType: "ETF/Fund",
        market: "PA",
        specialist: true,
        coverage: null,
        score: null,
        rating: null,
      },
    ]);

    expect(kpis.overall).toEqual(expect.objectContaining({
      input: 6,
      completed: 5,
      rated: 3,
      noRating: 2,
      ratingRate: 0.6,
      noRatingRate: 0.4,
    }));

    expect(kpis.specialist).toEqual(expect.objectContaining({
      input: 5,
      completed: 4,
      targetEligible: 4,
      meets99PercentCoverage: 2,
      coverageTargetRate: 0.5,
    }));

    expect(kpis.integrity).toEqual({
      ratingBelowCoverageTarget: ["BAD1"],
      noRatingAtOrAboveCoverageTargetWithScore: ["INV-B.ST"],
      analysisEngineErrors: [],
      scoreRatingMismatches: ["ETF2", "INV-B.ST"],
    });

    expect(kpis.bySecurityType["ETF/Fund"]).toEqual(expect.objectContaining({
      input: 4,
      completed: 3,
      rated: 2,
      noRating: 1,
    }));
    expect(kpis.byMarket.US).toEqual(expect.objectContaining({
      input: 3,
      completed: 3,
    }));
  });

  it("uses null rates rather than pretending an empty denominator is zero coverage", () => {
    const kpis = buildGlobalAuditKpis([]);

    expect(kpis.overall.ratingRate).toBeNull();
    expect(kpis.overall.noRatingRate).toBeNull();
    expect(kpis.specialist.coverageTargetRate).toBeNull();
    expect(kpis.integrity.ratingBelowCoverageTarget).toEqual([]);
    expect(kpis.integrity.noRatingAtOrAboveCoverageTargetWithScore).toEqual([]);
    expect(kpis.integrity.analysisEngineErrors).toEqual([]);
    expect(kpis.integrity.scoreRatingMismatches).toEqual([]);
  });
});
