import { describe, expect, it } from "vitest";
import {
  STOCKBOX_MONTHLY_BUDGET_CAP_SEK,
  evaluateSystemBudget,
  recommendInfrastructureBudgetIncrease,
} from "@/lib/cost-control/budget";

describe("evaluateSystemBudget", () => {
  it("allows normal work below 80 percent of the monthly cap", () => {
    const decision = evaluateSystemBudget({
      currentMonthlySpendSek: 50,
      projectedAdditionalSpendSek: 10,
      category: "analysis",
      priority: "normal",
    });

    expect(decision.allowedNewSpend).toBe(true);
    expect(decision.mode).toBe("normal");
    expect(decision.action).toBe("allow");
  });

  it("switches to optimization at 80 percent projected usage", () => {
    const decision = evaluateSystemBudget({
      currentMonthlySpendSek: 95,
      projectedAdditionalSpendSek: 5,
      category: "ai",
      priority: "normal",
    });

    expect(decision.allowedNewSpend).toBe(true);
    expect(decision.mode).toBe("optimize");
    expect(decision.action).toBe("allow_with_optimization");
  });

  it("pauses optional work at 90 percent projected usage", () => {
    const decision = evaluateSystemBudget({
      currentMonthlySpendSek: 110,
      projectedAdditionalSpendSek: 3,
      category: "growth",
      priority: "optional",
    });

    expect(decision.allowedNewSpend).toBe(false);
    expect(decision.mode).toBe("pause_noncritical");
    expect(decision.action).toBe("pause");
  });

  it("never weakens financial correctness when the cap is reached", () => {
    const decision = evaluateSystemBudget({
      currentMonthlySpendSek: STOCKBOX_MONTHLY_BUDGET_CAP_SEK,
      projectedAdditionalSpendSek: 1,
      category: "financial_data",
      priority: "critical",
    });

    expect(decision.allowedNewSpend).toBe(false);
    expect(decision.mode).toBe("hard_stop");
    expect(decision.action).toBe("queue_or_reuse_verified_data");
  });

  it("fails closed on unknown cost", () => {
    const decision = evaluateSystemBudget({
      currentMonthlySpendSek: 20,
      projectedAdditionalSpendSek: null,
      category: "external_api",
      priority: "optional",
    });

    expect(decision.allowedNewSpend).toBe(false);
    expect(decision.reason).toBe("unknown_cost");
  });
});

describe("recommendInfrastructureBudgetIncrease", () => {
  it("can recommend an increase when growth economics support it without changing the cap", () => {
    const result = recommendInfrastructureBudgetIncrease({
      currentMrrSek: 2_000,
      currentMonthlyCostSek: 120,
      proposedMonthlyCostSek: 250,
      expectedBenefit: "Increase reliable analysis capacity for paying users",
    });

    expect(result.shouldRecommendIncrease).toBe(true);
    expect(STOCKBOX_MONTHLY_BUDGET_CAP_SEK).toBe(125);
  });

  it("does not recommend an increase when MRR cannot support it", () => {
    const result = recommendInfrastructureBudgetIncrease({
      currentMrrSek: 100,
      currentMonthlyCostSek: 120,
      proposedMonthlyCostSek: 250,
      expectedBenefit: "More capacity",
    });

    expect(result.shouldRecommendIncrease).toBe(false);
  });
});
