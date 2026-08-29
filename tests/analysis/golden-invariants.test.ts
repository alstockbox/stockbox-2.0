import { describe, expect, it } from "vitest";
import { analyzeFinancials } from "../../src/lib/analysis";
import { goldenAnalysisFixtures } from "./golden-fixtures";

const directionalRatings = new Set(["Strong Buy", "Buy", "Sell", "Strong Sell"]);

function expectOnlyFiniteNumbers(value: unknown, path = "result"): void {
  if (typeof value === "number") {
    expect(Number.isFinite(value), `${path} must be finite`).toBe(true);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => expectOnlyFiniteNumbers(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      expectOnlyFiniteNumbers(item, `${path}.${key}`);
    }
  }
}

describe("analysis engine golden invariants", () => {
  it("covers the complete pre-batch economic and data-safety matrix", () => {
    expect(goldenAnalysisFixtures.map((fixture) => fixture.id)).toEqual([
      "quality-compounder",
      "overvalued-compounder",
      "cheap-deteriorating",
      "high-leverage-industrial",
      "negative-fcf",
      "software-growth",
      "high-sbc-software",
      "cyclical-peak",
      "cyclical-trough",
      "utility",
      "bank-complete",
      "bank-missing-specialist",
      "insurer-complete",
      "insurer-missing-specialist",
      "reit-complete",
      "reit-missing-ffo",
      "pre-revenue-biotech",
      "holding-company",
      "unknown-archetype",
      "stale-fundamentals",
      "stale-market-price",
      "future-financials",
      "mixed-financial-currencies",
      "unknown-financial-currency",
      "cross-currency",
      "sparse-provider-data",
      "provider-conflict",
      "missing-fiscal-year-history",
      "diluted-shares-only",
      "extreme-outliers",
    ]);
  });

  it.each(goldenAnalysisFixtures)("keeps $id finite and within canonical bounds", ({ input }) => {
    const result = analyzeFinancials(input);
    expectOnlyFiniteNumbers(result);
    expect(result.scores.stockBoxScore === null || (result.scores.stockBoxScore >= 0 && result.scores.stockBoxScore <= 100)).toBe(true);
    expect(result.scores.personalizedScore === null || (result.scores.personalizedScore >= 0 && result.scores.personalizedScore <= 100)).toBe(true);
    expect(result.scores.confidence).toBeGreaterThanOrEqual(5);
    expect(result.scores.confidence).toBeLessThanOrEqual(98);
    expect(result.scores.dataCoverage).toBeGreaterThanOrEqual(0);
    expect(result.scores.dataCoverage).toBeLessThanOrEqual(1);
    Object.values(result.scores.dimensions).forEach((dimension) => {
      expect(dimension.coverage).toBeGreaterThanOrEqual(0);
      expect(dimension.coverage).toBeLessThanOrEqual(1);
      expect(dimension.score === null || (dimension.score >= 0 && dimension.score <= 100)).toBe(true);
    });
  });

  it.each(goldenAnalysisFixtures)("enforces recommendation and valuation safety for $id", ({ input }) => {
    const result = analyzeFinancials(input);
    if (directionalRatings.has(result.recommendation.rating)) {
      const specializedSupport = ["bank", "insurer", "reit"].includes(result.scores.analysisArchetype)
        && (result.scores.specializedCoverage?.overall ?? 0) >= 0.7
        && (result.scores.dimensions.valuation.coverage ?? 0) >= 0.8;
      const dcfSupport = result.dcf.status === "available" && result.dcf.directionalSupport !== false;
      expect(dcfSupport || specializedSupport).toBe(true);
    }
    if (result.scores.analysisArchetype === "unknown") {
      expect(result.scores.stockBoxScore).toBeNull();
      expect(result.recommendation.rating).toBe("No Rating");
    }
    if (result.dcf.status === "available") {
      const values = result.dcf.scenarios.map((scenario) => scenario.perShareValue);
      expect(values).toHaveLength(3);
      expect(values[0]).toBeLessThanOrEqual(values[1]);
      expect(values[1]).toBeLessThanOrEqual(values[2]);
    }
  });

  it("fails safely for the golden identity, date, currency and specialist gaps", () => {
    const results = new Map(goldenAnalysisFixtures.map(({ id, input }) => [id, analyzeFinancials(input)]));

    expect(results.get("future-financials")?.scores.stockBoxScore).toBeNull();
    expect(results.get("future-financials")?.recommendation.rating).toBe("No Rating");
    expect(results.get("mixed-financial-currencies")?.scores.stockBoxScore).toBeNull();
    expect(results.get("unknown-financial-currency")?.dcf.status).toBe("unavailable");
    expect(results.get("cross-currency")?.dcf.status).toBe("unavailable");
    expect(results.get("bank-missing-specialist")?.recommendation.rating).toBe("No Rating");
    expect(results.get("insurer-missing-specialist")?.recommendation.rating).toBe("No Rating");
    expect(results.get("reit-missing-ffo")?.recommendation.rating).toBe("No Rating");
    expect(results.get("provider-conflict")?.recommendation.rating).toBe("No Rating");
    expect(results.get("diluted-shares-only")?.dcf.status).toBe("unavailable");
    expect(results.get("diluted-shares-only")?.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "sharesOutstanding", impact: "dcf" }),
    ]));
  });

  it("never turns missing debt or cash into zero", () => {
    const sparse = goldenAnalysisFixtures.find((fixture) => fixture.id === "sparse-provider-data");
    expect(sparse).toBeDefined();
    const result = analyzeFinancials(sparse!.input);
    expect(result.metrics.ratios.netDebt).toBeNull();
    expect(result.metrics.ratios.debtToEquity).toBeNull();
  });
});
