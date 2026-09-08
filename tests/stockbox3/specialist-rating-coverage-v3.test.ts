import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  SPECIALIST_HIGH_CONFIDENCE_COVERAGE,
  SPECIALIST_MIN_RATING_COVERAGE,
  specialistCoverageGateMessage,
  specialistCoverageMeetsTarget,
} from "@/lib/analysis/specialist-coverage";

const universalProviderPath = path.join(
  process.cwd(),
  "src/lib/data/universal-security-provider.ts",
);

describe("StockBox 3 specialist rating coverage policy", () => {
  it("allows useful specialist ratings with partial verified data while preserving a hard minimum", () => {
    expect(SPECIALIST_MIN_RATING_COVERAGE).toBe(0.5);
    expect(SPECIALIST_HIGH_CONFIDENCE_COVERAGE).toBe(0.8);

    expect(specialistCoverageMeetsTarget(0.49)).toBe(false);
    expect(specialistCoverageMeetsTarget(0.5)).toBe(true);
    expect(specialistCoverageMeetsTarget(0.72)).toBe(true);
    expect(specialistCoverageMeetsTarget(0.99)).toBe(true);
    expect(specialistCoverageMeetsTarget(null)).toBe(false);
  });

  it("returns No Rating guidance only below the minimum and a confidence warning for limited coverage", () => {
    const insufficient = specialistCoverageGateMessage("ETF", 0.42);
    expect(insufficient).toContain("No Rating");
    expect(insufficient).toContain("50%");
    expect(insufficient).toContain("never be fabricated");

    const limited = specialistCoverageGateMessage("ETF", 0.65);
    expect(limited).toContain("coverage-limited");
    expect(limited).toContain("confidence");
    expect(limited).not.toContain("must return No Rating");

    expect(specialistCoverageGateMessage("ETF", 0.8)).toBeNull();
  });

  it("keeps ETF and investment-company recommendation wiring dependent on specialist coverage", () => {
    const provider = readFileSync(universalProviderPath, "utf8");

    expect(provider).toContain("specialistCoverageMeetsTarget");
    expect(provider).toContain('if (score === null || !specialistCoverageMeetsTarget(coverage)) return "No Rating"');
    expect(provider).toContain('specialistCoverageGateMessage("ETF", result.score.coverage)');
    expect(provider).toContain("report.dataCoverage = analysis.score.coverage");
    expect(provider).toContain("report.recommendation = recommendationForScore(analysis.score.score, analysis.score.coverage)");
    expect(provider).toContain('specialistCoverageGateMessage("Investment company", analysis.score.coverage)');
  });
});
