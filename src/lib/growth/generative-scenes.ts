import { evaluateBudget, type BudgetDecisionReason } from "./budget-governor";

export type GenerativeSceneRequest = {
  contentId: string;
  sceneId: string;
  prompt: string;
  durationSeconds: 2 | 3 | 4 | 5;
  aspectRatio: "9:16";
};

export interface GenerativeVideoProvider {
  name: string;
  estimateCostSek(request: GenerativeSceneRequest): Promise<number | null>;
  generate(request: GenerativeSceneRequest): Promise<{
    bytes: Uint8Array;
    mimeType: "video/mp4";
    actualCostSek?: number;
  }>;
}

export type GenerativeSceneReason = BudgetDecisionReason | "low_value" | "generated";

export type GenerativeSceneDecision = {
  action: "generate" | "motion_fallback";
  durationSeconds: 2 | 3 | 4 | 5;
  reason: GenerativeSceneReason;
  projectedMonthlySek: number | null;
};

export function planGenerativeScene(input: {
  monthlySpendSek: number;
  estimatedCostSek: number | null;
  durationSeconds: number;
  valueScore: number;
}): GenerativeSceneDecision {
  const durationSeconds = Math.min(5, Math.max(2, Math.round(input.durationSeconds))) as 2 | 3 | 4 | 5;
  const valueScore = Number.isFinite(input.valueScore) ? input.valueScore : 0;

  if (valueScore < 60) {
    return {
      action: "motion_fallback",
      durationSeconds,
      reason: "low_value",
      projectedMonthlySek: null,
    };
  }

  const budget = evaluateBudget({
    monthlySpendSek: input.monthlySpendSek,
    projectedCostSek: input.estimatedCostSek,
    optional: true,
  });

  if (!budget.allowed) {
    return {
      action: "motion_fallback",
      durationSeconds,
      reason: budget.reason,
      projectedMonthlySek: budget.projectedMonthlySek,
    };
  }

  return {
    action: "generate",
    durationSeconds,
    reason: "generated",
    projectedMonthlySek: budget.projectedMonthlySek,
  };
}
