import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const specialistCoveragePath = path.join(
  process.cwd(),
  "src/lib/analysis/specialist-coverage.ts",
);
const universalProviderPath = path.join(
  process.cwd(),
  "src/lib/data/universal-security-provider.ts",
);

describe("StockBox 3 specialist rating coverage gate", () => {
  it("requires 99% verified specialist coverage before ETF or investment-company ratings are emitted", () => {
    expect(existsSync(specialistCoveragePath)).toBe(true);

    const specialistCoverage = readFileSync(specialistCoveragePath, "utf8");
    const provider = readFileSync(universalProviderPath, "utf8");

    expect(specialistCoverage).toContain("SPECIALIST_COVERAGE_TARGET = 0.99");
    expect(specialistCoverage).toContain("coverage >= SPECIALIST_COVERAGE_TARGET");

    expect(provider).toContain("specialistCoverageMeetsTarget");
    expect(provider).toContain('if (score === null || !specialistCoverageMeetsTarget(coverage)) return "No Rating"');
    expect(provider).toContain('specialistCoverageGateMessage("ETF", result.score.coverage)');

    expect(provider).toContain("report.dataCoverage = analysis.score.coverage");
    expect(provider).toContain("report.recommendation = recommendationForScore(analysis.score.score, analysis.score.coverage)");
    expect(provider).toContain('specialistCoverageGateMessage("Investment company", analysis.score.coverage)');
  });
});
