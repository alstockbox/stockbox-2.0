import { describe, expect, it } from "vitest";
// @ts-ignore Executable Node ESM module is intentionally tested from the TypeScript suite.
import { evaluateGlobalAuditGate } from "./evaluate-global-audit-gate.mjs";

const complete = (input = 100) => ({
  input,
  discovered: input,
  supported: input,
  completed: input,
  rated: input,
  noRating: 0,
  discoveryRate: 1,
  supportCoverageRate: 1,
  completionRate: 1,
  ratingRate: 1,
  noRatingRate: 0,
});

const fixture = () => ({
  overall: complete(200),
  specialist: { input: 50, completed: 50, targetEligible: 50, meets99PercentCoverage: 50, coverageTargetRate: 1 },
  integrity: { ratingBelowCoverageTarget: [], noRatingAtOrAboveCoverageTargetWithScore: [] },
  bySecurityType: { "Common Stock": complete(100), "ETF/Fund": complete(50) },
  byMarket: { UNSUFFIXED: complete(100), ST: complete(50) },
});

describe("global audit release gate", () => {
  it("passes a healthy measured universe", () => {
    expect(evaluateGlobalAuditGate(fixture())).toEqual({ pass: true, violations: [] });
  });

  it("fails below the support target", () => {
    const kpis = fixture();
    kpis.overall.supportCoverageRate = 0.98;
    const result = evaluateGlobalAuditGate(kpis);
    expect(result.pass).toBe(false);
    expect(result.violations.some((item: string) => item.includes("support coverage"))).toBe(true);
  });

  it("fails on specialist integrity violations", () => {
    const kpis = fixture();
    kpis.integrity.ratingBelowCoverageTarget = ["TEST1"];
    const result = evaluateGlobalAuditGate(kpis);
    expect(result.pass).toBe(false);
    expect(result.violations.join(" ")).toContain("TEST1");
  });

  it("checks large market groups independently while ignoring tiny groups", () => {
    const kpis = fixture();
    kpis.byMarket.ST.supportCoverageRate = 0.98;
    expect(evaluateGlobalAuditGate(kpis).pass).toBe(false);

    const tiny = fixture();
    tiny.byMarket.TINY = { ...complete(5), supportCoverageRate: 0 };
    expect(evaluateGlobalAuditGate(tiny).pass).toBe(true);
  });
});
