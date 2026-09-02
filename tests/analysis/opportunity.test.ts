import { describe, expect, it } from "vitest";
import { computeOpportunityAssessment } from "@/lib/analysis/opportunity";

describe("computeOpportunityAssessment", () => {
  it("weights mispricing most heavily for a value lens", () => {
    const input = { coreScore: 70, mispricingScore: 90, inflectionScore: 50 };
    const value = computeOpportunityAssessment({ ...input, profile: "value" });
    const growth = computeOpportunityAssessment({ ...input, profile: "growth" });
    expect(value.score as number).toBeGreaterThan(growth.score as number);
    expect(value.components.find((item) => item.id === "mispricing")?.plannedWeight).toBe(0.55);
  });

  it("weights inflection most heavily for short-term analysis", () => {
    const input = { coreScore: 65, mispricingScore: 50, inflectionScore: 92 };
    const shortTerm = computeOpportunityAssessment({ ...input, profile: "short_term" });
    const longTerm = computeOpportunityAssessment({ ...input, profile: "long_term" });
    expect(shortTerm.score as number).toBeGreaterThan(longTerm.score as number);
    expect(shortTerm.components.find((item) => item.id === "inflection")?.plannedWeight).toBe(0.65);
  });

  it("renormalizes available components instead of treating a missing component as zero", () => {
    const result = computeOpportunityAssessment({ coreScore: 80, mispricingScore: null, inflectionScore: 60, profile: "value" });
    expect(result.score).toBeCloseTo((80 * 0.3 + 60 * 0.15) / 0.45, 8);
    expect(result.coverage).toBeCloseTo(0.45, 8);
  });

  it("returns unavailable when fewer than two independent components exist", () => {
    const result = computeOpportunityAssessment({ coreScore: 88, mispricingScore: null, inflectionScore: null, profile: "quality" });
    expect(result.score).toBeNull();
    expect(result.label).toBe("uncertain");
  });
});
