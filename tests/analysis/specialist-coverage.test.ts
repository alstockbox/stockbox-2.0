import { describe, expect, it } from "vitest";
import {
  SPECIALIST_COVERAGE_TARGET,
  specialistCoverageGateMessage,
  specialistCoverageMeetsTarget,
  specialistCoveragePercent,
} from "../../src/lib/analysis/specialist-coverage";

describe("specialist coverage policy", () => {
  it("requires at least 99% verified specialist coverage", () => {
    expect(SPECIALIST_COVERAGE_TARGET).toBe(0.99);
    expect(specialistCoverageMeetsTarget(0.9899)).toBe(false);
    expect(specialistCoverageMeetsTarget(0.99)).toBe(true);
    expect(specialistCoverageMeetsTarget(1)).toBe(true);
  });

  it("reports coverage precisely enough to expose near misses", () => {
    expect(specialistCoveragePercent(0.989)).toBe(98.9);
    expect(specialistCoveragePercent(0.999)).toBe(99.9);
  });

  it("explains that missing data stays N/A instead of being fabricated", () => {
    const message = specialistCoverageGateMessage("ETF", 0.82);
    expect(message).toMatch(/82%/);
    expect(message).toMatch(/No Rating/);
    expect(message).toMatch(/never be fabricated/i);
    expect(specialistCoverageGateMessage("ETF", 0.99)).toBeNull();
  });
});