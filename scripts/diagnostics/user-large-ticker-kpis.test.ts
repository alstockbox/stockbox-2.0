import { describe, expect, it } from "vitest";
import { buildGlobalAuditKpis, type GlobalAuditKpiInput } from "./user-large-ticker-kpis";

function input(overrides: Partial<GlobalAuditKpiInput> = {}): GlobalAuditKpiInput {
  return {
    query: "AAPL",
    status: "completed",
    securityType: "Common Stock",
    market: "UNSUFFIXED",
    specialist: false,
    coverage: 1,
    score: 80,
    rating: "Buy",
    ...overrides,
  };
}

describe("global ticker audit KPIs", () => {
  it("separates discovery, support and completion denominators using live audit statuses", () => {
    const kpis = buildGlobalAuditKpis([
      input({ query: "OK" }),
      input({ query: "UNSUPPORTED", status: "unsupported", score: null, rating: null }),
      input({ query: "NOT_FOUND", status: "not_found", score: null, rating: null }),
      input({ query: "PROVIDER", status: "provider_failure", score: null, rating: null }),
    ]);

    expect(kpis.overall).toMatchObject({
      input: 4,
      discovered: 3,
      supported: 2,
      completed: 1,
      discoveryRate: 0.75,
      supportCoverageRate: 2 / 3,
      completionRate: 0.5,
    });
  });

  it("reports support coverage independently for markets and security types", () => {
    const kpis = buildGlobalAuditKpis([
      input({ query: "US_OK", market: "UNSUFFIXED", securityType: "Common Stock" }),
      input({ query: "US_UNSUPPORTED", market: "UNSUFFIXED", securityType: "Preferred", status: "unsupported", score: null, rating: null }),
      input({ query: "SE_OK", market: "ST", securityType: "Common Stock" }),
    ]);

    expect(kpis.byMarket.UNSUFFIXED.supportCoverageRate).toBe(0.5);
    expect(kpis.byMarket.ST.supportCoverageRate).toBe(1);
    expect(kpis.bySecurityType.Preferred.supportCoverageRate).toBe(0);
    expect(kpis.bySecurityType["Common Stock"].supportCoverageRate).toBe(1);
  });

  it("keeps honest No Rating separate from unsupported securities", () => {
    const kpis = buildGlobalAuditKpis([
      input({ query: "NO_RATING", rating: "No Rating", score: null, coverage: 0.6 }),
      input({ query: "UNSUPPORTED", status: "unsupported", rating: null, score: null, coverage: null }),
    ]);

    expect(kpis.overall.noRating).toBe(1);
    expect(kpis.overall.completed).toBe(1);
    expect(kpis.overall.supported).toBe(1);
    expect(kpis.overall.supportCoverageRate).toBe(0.5);
    expect(kpis.integrity.scoreRatingMismatches).toEqual([]);
  });

  it("also understands the canonical SLO unsupported status", () => {
    const kpis = buildGlobalAuditKpis([
      input({ query: "CANONICAL", status: "unsupported_security_type", score: null, rating: null }),
    ]);

    expect(kpis.overall.discovered).toBe(1);
    expect(kpis.overall.supported).toBe(0);
    expect(kpis.overall.supportCoverageRate).toBe(0);
  });

  it("reports every analysis engine error as a zero-tolerance integrity violation", () => {
    const kpis = buildGlobalAuditKpis([
      input({ query: "OK" }),
      input({ query: "BROKEN", status: "analysis_engine_error", score: null, rating: null }),
    ]);

    expect(kpis.integrity.analysisEngineErrors).toEqual(["BROKEN"]);
  });

  it("reports canonical score and rating state mismatches", () => {
    const kpis = buildGlobalAuditKpis([
      input({ query: "HONEST_NO_RATING", rating: "No Rating", score: null }),
      input({ query: "NO_RATING_WITH_SCORE", rating: "No Rating", score: 61 }),
      input({ query: "BUY_WITHOUT_SCORE", rating: "Buy", score: null }),
      input({ query: "HEALTHY", rating: "Hold", score: 55 }),
    ]);

    expect(kpis.integrity.scoreRatingMismatches).toEqual(["BUY_WITHOUT_SCORE", "NO_RATING_WITH_SCORE"]);
  });
});
