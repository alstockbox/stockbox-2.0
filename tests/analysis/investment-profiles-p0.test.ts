import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { profileWeights, weightsForSectorAndProfile } from "../../src/lib/analysis/config";
import { PROFILE_PRESENTATION, orderScoreDimensions } from "../../src/lib/analysis/profile-presentation";
import type { ScoreDimension } from "../../src/lib/analysis/types";

const repoFile = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("P0 investment profiles", () => {
  it("implements a defensive profile with materially defensive weighting", () => {
    const defensive = profileWeights.defensive;
    expect(defensive).toBeDefined();
    expect(Object.values(defensive).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 8);
    expect(defensive.financialHealth).toBeGreaterThan(defensive.growth);
    expect(defensive.cashFlow).toBeGreaterThan(defensive.momentum);
    expect(defensive.risk).toBeGreaterThan(defensive.momentum);

    const resolved = weightsForSectorAndProfile("industrials", "defensive");
    expect(resolved.financialHealth).toBeGreaterThan(resolved.growth);
  });

  it("gives the five core lenses distinct first-visible priorities", () => {
    expect(PROFILE_PRESENTATION.growth.priority[0]).toBe("growth");
    expect(PROFILE_PRESENTATION.value.priority[0]).toBe("valuation");
    expect(PROFILE_PRESENTATION.quality.priority[0]).toBe("quality");
    expect(PROFILE_PRESENTATION.dividend.priority[0]).toBe("cashFlow");
    expect(PROFILE_PRESENTATION.defensive.priority[0]).toBe("financialHealth");
  });

  it("reorders the score stack by profile without changing the underlying dimension values", () => {
    const dimensions = [
      { key: "growth", label: "Growth", score: 70, weight: 0.2 },
      { key: "valuation", label: "Valuation", score: 55, weight: 0.2 },
      { key: "quality", label: "Quality", score: 80, weight: 0.2 },
      { key: "financialHealth", label: "Financial health", score: 75, weight: 0.2 },
      { key: "cashFlow", label: "Cash flow", score: 72, weight: 0.2 },
    ] as ScoreDimension[];

    const valueView = orderScoreDimensions(dimensions, "value");
    const defensiveView = orderScoreDimensions(dimensions, "defensive");
    expect(valueView[0]?.key).toBe("valuation");
    expect(defensiveView[0]?.key).toBe("financialHealth");
    expect(dimensions[0]?.key).toBe("growth");
    expect(new Map(valueView.map((dimension) => [dimension.key, dimension.score]))).toEqual(
      new Map(dimensions.map((dimension) => [dimension.key, dimension.score])),
    );
  });

  it("keeps advanced settings while surfacing the investment lens outside it", () => {
    const workbench = repoFile("src/components/analysis/analysis-workbench.tsx");
    const profileSelect = workbench.indexOf('data-testid="primary-investment-profile"');
    const advanced = workbench.indexOf("<details");
    expect(profileSelect).toBeGreaterThan(-1);
    expect(advanced).toBeGreaterThan(-1);
    expect(profileSelect).toBeLessThan(advanced);
    expect(workbench).toContain("profilePresentationFor(investmentProfile, locale)");
  });

  it("accepts defensive consistently across API, profile persistence and batch UI", () => {
    expect(repoFile("src/app/api/analysis/route.ts")).toContain('"dividend", "defensive", "balanced"');
    expect(repoFile("src/lib/profile/actions.ts")).toContain('"dividend", "defensive", "balanced"');
    expect(repoFile("src/components/analysis/analysis-workbench-state.ts")).toContain('"dividend", "defensive", "balanced"');
    expect(repoFile("src/components/batch/batch-workbench.tsx")).toContain('<option value="defensive">{analyzeCopy.defensive}</option>');
  });
});
