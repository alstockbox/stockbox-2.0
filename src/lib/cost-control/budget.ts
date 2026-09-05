export const STOCKBOX_MONTHLY_BUDGET_CAP_SEK = 125;
export const STOCKBOX_OPTIMIZE_THRESHOLD_RATIO = 0.8;
export const STOCKBOX_PAUSE_THRESHOLD_RATIO = 0.9;

export type CostCategory =
  | "financial_data"
  | "ai"
  | "analysis"
  | "daily_briefing"
  | "growth"
  | "background_jobs"
  | "storage"
  | "hosting"
  | "database"
  | "external_api"
  | "other";

export type CostPriority = "critical" | "normal" | "optional";

export type SystemBudgetMode =
  | "normal"
  | "optimize"
  | "pause_noncritical"
  | "hard_stop";

export type CostControlAction =
  | "allow"
  | "allow_with_optimization"
  | "queue_or_reuse_verified_data"
  | "pause"
  | "require_admin_approval";

export type SystemBudgetInput = {
  currentMonthlySpendSek: number;
  projectedAdditionalSpendSek: number | null;
  category: CostCategory;
  priority?: CostPriority;
  adminApprovedBudgetIncrease?: boolean;
};

export type SystemBudgetDecision = {
  allowedNewSpend: boolean;
  mode: SystemBudgetMode;
  action: CostControlAction;
  currentMonthlySpendSek: number;
  projectedMonthlySpendSek: number | null;
  usageRatio: number;
  reason:
    | "within_budget"
    | "optimize"
    | "pause_noncritical"
    | "hard_cap"
    | "unknown_cost"
    | "invalid_cost"
    | "admin_override";
};

function finiteNonNegative(value: number) {
  return Number.isFinite(value) && value >= 0;
}

function normalizedSpend(value: number) {
  if (!finiteNonNegative(value)) return STOCKBOX_MONTHLY_BUDGET_CAP_SEK;
  return value;
}

function isFinancialCorrectnessCritical(input: SystemBudgetInput) {
  return input.category === "financial_data" || input.priority === "critical";
}

/**
 * System-wide 125 SEK/month guardrail for StockBox 3.0.
 *
 * Important invariant: reaching the cap never authorizes weaker financial-data
 * validation or guessed data. Critical financial work is queued or served from
 * already verified/fresh-enough cached data instead of creating unapproved spend.
 */
export function evaluateSystemBudget(input: SystemBudgetInput): SystemBudgetDecision {
  const currentMonthlySpendSek = normalizedSpend(input.currentMonthlySpendSek);
  const usageRatio = currentMonthlySpendSek / STOCKBOX_MONTHLY_BUDGET_CAP_SEK;

  if (input.adminApprovedBudgetIncrease) {
    const projectedMonthlySpendSek =
      input.projectedAdditionalSpendSek !== null && finiteNonNegative(input.projectedAdditionalSpendSek)
        ? currentMonthlySpendSek + input.projectedAdditionalSpendSek
        : null;
    return {
      allowedNewSpend: true,
      mode: usageRatio >= 1 ? "hard_stop" : usageRatio >= STOCKBOX_PAUSE_THRESHOLD_RATIO ? "pause_noncritical" : usageRatio >= STOCKBOX_OPTIMIZE_THRESHOLD_RATIO ? "optimize" : "normal",
      action: usageRatio >= STOCKBOX_OPTIMIZE_THRESHOLD_RATIO ? "allow_with_optimization" : "allow",
      currentMonthlySpendSek,
      projectedMonthlySpendSek,
      usageRatio,
      reason: "admin_override",
    };
  }

  if (input.projectedAdditionalSpendSek === null) {
    return {
      allowedNewSpend: false,
      mode: usageRatio >= 1 ? "hard_stop" : "pause_noncritical",
      action: isFinancialCorrectnessCritical(input) ? "queue_or_reuse_verified_data" : "pause",
      currentMonthlySpendSek,
      projectedMonthlySpendSek: null,
      usageRatio,
      reason: "unknown_cost",
    };
  }

  if (!finiteNonNegative(input.projectedAdditionalSpendSek)) {
    return {
      allowedNewSpend: false,
      mode: "pause_noncritical",
      action: isFinancialCorrectnessCritical(input) ? "queue_or_reuse_verified_data" : "pause",
      currentMonthlySpendSek,
      projectedMonthlySpendSek: null,
      usageRatio,
      reason: "invalid_cost",
    };
  }

  const projectedMonthlySpendSek = currentMonthlySpendSek + input.projectedAdditionalSpendSek;
  const projectedRatio = projectedMonthlySpendSek / STOCKBOX_MONTHLY_BUDGET_CAP_SEK;

  if (currentMonthlySpendSek >= STOCKBOX_MONTHLY_BUDGET_CAP_SEK || projectedMonthlySpendSek > STOCKBOX_MONTHLY_BUDGET_CAP_SEK) {
    return {
      allowedNewSpend: false,
      mode: "hard_stop",
      action: isFinancialCorrectnessCritical(input) ? "queue_or_reuse_verified_data" : "require_admin_approval",
      currentMonthlySpendSek,
      projectedMonthlySpendSek,
      usageRatio,
      reason: "hard_cap",
    };
  }

  if (projectedRatio >= STOCKBOX_PAUSE_THRESHOLD_RATIO) {
    const optional = input.priority === "optional";
    return {
      allowedNewSpend: !optional,
      mode: "pause_noncritical",
      action: optional ? "pause" : "allow_with_optimization",
      currentMonthlySpendSek,
      projectedMonthlySpendSek,
      usageRatio,
      reason: "pause_noncritical",
    };
  }

  if (projectedRatio >= STOCKBOX_OPTIMIZE_THRESHOLD_RATIO) {
    return {
      allowedNewSpend: true,
      mode: "optimize",
      action: "allow_with_optimization",
      currentMonthlySpendSek,
      projectedMonthlySpendSek,
      usageRatio,
      reason: "optimize",
    };
  }

  return {
    allowedNewSpend: true,
    mode: "normal",
    action: "allow",
    currentMonthlySpendSek,
    projectedMonthlySpendSek,
    usageRatio,
    reason: "within_budget",
  };
}

export type InfrastructureBudgetRecommendationInput = {
  currentMrrSek: number;
  currentMonthlyCostSek: number;
  proposedMonthlyCostSek: number;
  expectedBenefit: string;
};

export type InfrastructureBudgetRecommendation = {
  shouldRecommendIncrease: boolean;
  currentMrrSek: number;
  currentMonthlyCostSek: number;
  proposedMonthlyCostSek: number;
  expectedBenefit: string;
  currentCostToMrrRatio: number | null;
};

/**
 * Produces an admin recommendation only. It never changes the budget automatically.
 */
export function recommendInfrastructureBudgetIncrease(
  input: InfrastructureBudgetRecommendationInput,
): InfrastructureBudgetRecommendation {
  const currentMrrSek = Math.max(0, Number.isFinite(input.currentMrrSek) ? input.currentMrrSek : 0);
  const currentMonthlyCostSek = Math.max(
    0,
    Number.isFinite(input.currentMonthlyCostSek) ? input.currentMonthlyCostSek : 0,
  );
  const proposedMonthlyCostSek = Math.max(
    currentMonthlyCostSek,
    Number.isFinite(input.proposedMonthlyCostSek) ? input.proposedMonthlyCostSek : currentMonthlyCostSek,
  );

  return {
    shouldRecommendIncrease:
      currentMonthlyCostSek >= STOCKBOX_MONTHLY_BUDGET_CAP_SEK * STOCKBOX_PAUSE_THRESHOLD_RATIO &&
      proposedMonthlyCostSek > STOCKBOX_MONTHLY_BUDGET_CAP_SEK &&
      currentMrrSek > proposedMonthlyCostSek,
    currentMrrSek,
    currentMonthlyCostSek,
    proposedMonthlyCostSek,
    expectedBenefit: input.expectedBenefit.trim(),
    currentCostToMrrRatio: currentMrrSek > 0 ? currentMonthlyCostSek / currentMrrSek : null,
  };
}
