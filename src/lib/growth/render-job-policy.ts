import { chooseDailyVideoCapacity, evaluateBudget } from "./budget-governor";

export type AutomaticRenderCandidate = {
  candidateId: string;
  language: "sv" | "en";
  qualityScore: number;
  expectedGrowthScore: number;
  projectedCostSek: number | null;
  experimental?: boolean;
};

export type AutomaticRenderSelection = AutomaticRenderCandidate & {
  exposeToReady: boolean;
  budgetMode: ReturnType<typeof evaluateBudget>["mode"];
};

export type AutomaticRenderPolicyInput = {
  candidates: AutomaticRenderCandidate[];
  monthlySpendSek: number;
  shadowMode: boolean;
};

const QUALITY_FLOOR = 72;

export function selectAutomaticRenderJobs(input: AutomaticRenderPolicyInput): AutomaticRenderSelection[] {
  const eligible = input.candidates
    .filter((candidate) => Number(candidate.qualityScore) >= QUALITY_FLOOR)
    .sort((a, b) => {
      if (a.language !== b.language) return a.language === "sv" ? -1 : 1;
      return b.expectedGrowthScore - a.expectedGrowthScore || b.qualityScore - a.qualityScore || a.candidateId.localeCompare(b.candidateId);
    });

  const capacity = chooseDailyVideoCapacity({
    monthlySpendSek: input.monthlySpendSek,
    qualityCandidates: eligible.length,
  });
  if (capacity === 0) return [];

  const selected: AutomaticRenderSelection[] = [];
  let projectedSpend = Math.max(0, Number.isFinite(input.monthlySpendSek) ? input.monthlySpendSek : 75);
  let englishCount = 0;

  for (const candidate of eligible) {
    if (selected.length >= capacity) break;
    if (candidate.language === "en" && englishCount >= 1) continue;

    const decision = evaluateBudget({
      monthlySpendSek: projectedSpend,
      projectedCostSek: candidate.projectedCostSek,
      optional: candidate.language === "en" || candidate.experimental === true,
    });
    if (!decision.allowed) continue;

    selected.push({
      ...candidate,
      exposeToReady: !input.shadowMode,
      budgetMode: decision.mode,
    });
    projectedSpend = decision.projectedMonthlySek ?? projectedSpend;
    if (candidate.language === "en") englishCount += 1;
  }

  return selected;
}
