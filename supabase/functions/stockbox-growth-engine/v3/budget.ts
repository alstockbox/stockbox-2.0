// Pure Edge mirror of src/lib/growth/budget-governor.ts.
export const GROWTH_BUDGET_TARGET_SEK = 50;
export const GROWTH_BUDGET_SOFT_LIMIT_SEK = 40;
export const GROWTH_BUDGET_HARD_CAP_SEK = 75;

export type BudgetMode = "normal" | "conserve" | "free_only" | "hard_stop";
export type BudgetDecision = { allowed: boolean; mode: BudgetMode; projectedMonthlySek: number | null; reason: "within_budget" | "conserve" | "target_exceeded" | "hard_cap" | "unknown_cost" | "invalid_cost" };

export function evaluateBudget(input: { monthlySpendSek: number; projectedCostSek: number | null; optional?: boolean }): BudgetDecision {
  if (input.projectedCostSek === null || !Number.isFinite(input.projectedCostSek)) return { allowed: false, mode: "free_only", projectedMonthlySek: null, reason: "unknown_cost" };
  if (input.projectedCostSek < 0) return { allowed: false, mode: "free_only", projectedMonthlySek: null, reason: "invalid_cost" };
  const monthlySpendSek = Number.isFinite(input.monthlySpendSek) ? Math.max(0, input.monthlySpendSek) : GROWTH_BUDGET_HARD_CAP_SEK;
  const projectedMonthlySek = monthlySpendSek + input.projectedCostSek;
  if (monthlySpendSek >= GROWTH_BUDGET_HARD_CAP_SEK || projectedMonthlySek > GROWTH_BUDGET_HARD_CAP_SEK) return { allowed: false, mode: "hard_stop", projectedMonthlySek, reason: "hard_cap" };
  if (projectedMonthlySek > GROWTH_BUDGET_TARGET_SEK && input.optional) return { allowed: false, mode: "free_only", projectedMonthlySek, reason: "target_exceeded" };
  if (projectedMonthlySek > GROWTH_BUDGET_SOFT_LIMIT_SEK) return { allowed: true, mode: "conserve", projectedMonthlySek, reason: "conserve" };
  return { allowed: true, mode: "normal", projectedMonthlySek, reason: "within_budget" };
}

export function chooseDailyVideoCapacity(input: { monthlySpendSek: number; qualityCandidates: number }): 0 | 1 | 2 {
  const qualityCandidates = Math.max(0, Math.floor(input.qualityCandidates));
  if (!qualityCandidates) return 0;
  const monthlySpendSek = Number.isFinite(input.monthlySpendSek) ? Math.max(0, input.monthlySpendSek) : GROWTH_BUDGET_HARD_CAP_SEK;
  if (monthlySpendSek >= GROWTH_BUDGET_HARD_CAP_SEK) return 0;
  if (monthlySpendSek >= GROWTH_BUDGET_SOFT_LIMIT_SEK) return 1;
  return Math.min(2, qualityCandidates) as 0 | 1 | 2;
}
