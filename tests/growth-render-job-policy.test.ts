import { describe, expect, it } from "vitest";
import { selectAutomaticRenderJobs } from "@/lib/growth/render-job-policy";

const strong = [
  { candidateId: "sv-1", language: "sv" as const, qualityScore: 98, expectedGrowthScore: 92, projectedCostSek: 0.2 },
  { candidateId: "sv-2", language: "sv" as const, qualityScore: 95, expectedGrowthScore: 88, projectedCostSek: 0.2 },
  { candidateId: "en-1", language: "en" as const, qualityScore: 94, expectedGrowthScore: 84, projectedCostSek: 0.2, experimental: true },
];

describe("automatic growth render-job policy", () => {
  it("selects at most two strong candidates at low spend", () => {
    const selected = selectAutomaticRenderJobs({ candidates: strong, monthlySpendSek: 10, shadowMode: false });
    expect(selected).toHaveLength(2);
    expect(selected.every((item) => item.exposeToReady)).toBe(true);
  });

  it("reduces capacity to one after the soft limit", () => {
    const selected = selectAutomaticRenderJobs({ candidates: strong, monthlySpendSek: 46, shadowMode: false });
    expect(selected).toHaveLength(1);
  });

  it("selects zero paid renders at the hard cap", () => {
    expect(selectAutomaticRenderJobs({ candidates: strong, monthlySpendSek: 75, shadowMode: false })).toEqual([]);
  });

  it("selects nothing when no candidate reaches quality 72", () => {
    const weak = strong.map((candidate) => ({ ...candidate, qualityScore: 50 }));
    expect(selectAutomaticRenderJobs({ candidates: weak, monthlySpendSek: 0, shadowMode: false })).toEqual([]);
  });

  it("still selects shadow jobs but never exposes them to READY", () => {
    const selected = selectAutomaticRenderJobs({ candidates: strong, monthlySpendSek: 0, shadowMode: true });
    expect(selected.length).toBeGreaterThan(0);
    expect(selected.every((item) => item.exposeToReady === false)).toBe(true);
  });

  it("does not let an English experiment displace all Swedish core capacity", () => {
    const selected = selectAutomaticRenderJobs({ candidates: [strong[2], strong[0], strong[1]], monthlySpendSek: 0, shadowMode: false });
    expect(selected.some((item) => item.language === "sv")).toBe(true);
    expect(selected.filter((item) => item.language === "en").length).toBeLessThanOrEqual(1);
  });
});
