import { describe, expect, it } from "vitest";
import {
  CURRENT_OFFICIAL_MONITORING_PROVIDER_PLAN,
  OFFICIAL_MONITORING_FREE_PROVIDER_IDS,
  currentOfficialMonitoringCostDecision,
  evaluateOfficialMonitoringCostPolicy,
} from "@/lib/monitoring/cost-policy-v3";

describe("Official monitoring cost policy V3", () => {
  it("allows the current explicitly classified free official provider plan", () => {
    const decision = currentOfficialMonitoringCostDecision({ backgroundJobsKilled: false });
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) throw new Error("expected allowed decision");
    expect(decision.variableApiCostSek).toBe(0);
    expect(decision.reason).toBe("verified_zero_variable_api_cost");
    expect(decision.providers).toEqual([...CURRENT_OFFICIAL_MONITORING_PROVIDER_PLAN].sort());
  });

  it("fails closed when a future provider has no cost classification", () => {
    const decision = evaluateOfficialMonitoringCostPolicy(
      [...OFFICIAL_MONITORING_FREE_PROVIDER_IDS, "future-paid-provider"],
      { backgroundJobsKilled: false },
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked decision");
    expect(decision.reason).toBe("provider_cost_review_required");
    expect(decision.unknownProviders).toEqual(["future-paid-provider"]);
  });

  it("honors the global background-jobs kill switch even for zero-variable-cost providers", () => {
    const decision = currentOfficialMonitoringCostDecision({ backgroundJobsKilled: true });
    expect(decision).toMatchObject({
      allowed: false,
      reason: "background_jobs_killed",
      variableApiCostSek: null,
    });
  });

  it("normalizes and deduplicates provider ids before evaluation", () => {
    const decision = evaluateOfficialMonitoringCostPolicy(
      [" GLEIF ", "gleif", "SEC"],
      { backgroundJobsKilled: false },
    );
    expect(decision.allowed).toBe(true);
    expect(decision.providers).toEqual(["gleif", "sec"]);
  });
});
