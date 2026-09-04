import { describe, expect, it } from "vitest";
import { chooseDailyVideoCapacity, evaluateBudget } from "../src/lib/growth/budget-governor";

describe("growth budget governor", () => {
  it("allows a bounded paid call while projected spend stays below target", () => {
    expect(evaluateBudget({ monthlySpendSek: 20, projectedCostSek: 5 })).toMatchObject({
      allowed: true,
      mode: "normal",
    });
  });

  it("removes optional paid generation above the target budget", () => {
    expect(evaluateBudget({ monthlySpendSek: 49, projectedCostSek: 3, optional: true })).toMatchObject({
      allowed: false,
      mode: "free_only",
    });
  });

  it("never authorizes a call that could cross the 75 SEK hard ceiling", () => {
    expect(evaluateBudget({ monthlySpendSek: 74, projectedCostSek: 2 })).toMatchObject({
      allowed: false,
      mode: "hard_stop",
    });
  });

  it("fails closed when projected paid cost is unknown", () => {
    expect(evaluateBudget({ monthlySpendSek: 10, projectedCostSek: null })).toMatchObject({
      allowed: false,
      reason: "unknown_cost",
    });
  });

  it("reduces daily video capacity as budget pressure rises", () => {
    expect(chooseDailyVideoCapacity({ monthlySpendSek: 10, qualityCandidates: 2 })).toBe(2);
    expect(chooseDailyVideoCapacity({ monthlySpendSek: 46, qualityCandidates: 2 })).toBe(1);
    expect(chooseDailyVideoCapacity({ monthlySpendSek: 75, qualityCandidates: 2 })).toBe(0);
  });
});
