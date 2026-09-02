import type { InvestmentProfile } from "./types";

export type OpportunityComponentId = "core" | "mispricing" | "inflection";
export type OpportunityLabel = "exceptional" | "attractive" | "mixed" | "weak" | "uncertain";

export type OpportunityComponent = {
  id: OpportunityComponentId;
  label: string;
  score: number | null;
  plannedWeight: number;
  effectiveWeight: number;
};

export type OpportunityAssessment = {
  score: number | null;
  coverage: number;
  label: OpportunityLabel;
  profile: InvestmentProfile;
  components: OpportunityComponent[];
};

const OPPORTUNITY_WEIGHTS: Record<InvestmentProfile, Record<OpportunityComponentId, number>> = {
  balanced: { core: 0.45, mispricing: 0.3, inflection: 0.25 },
  long_term: { core: 0.65, mispricing: 0.25, inflection: 0.1 },
  short_term: { core: 0.2, mispricing: 0.15, inflection: 0.65 },
  growth: { core: 0.4, mispricing: 0.2, inflection: 0.4 },
  value: { core: 0.3, mispricing: 0.55, inflection: 0.15 },
  quality: { core: 0.7, mispricing: 0.2, inflection: 0.1 },
  dividend: { core: 0.55, mispricing: 0.35, inflection: 0.1 },
  defensive: { core: 0.7, mispricing: 0.25, inflection: 0.05 },
};

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function labelFor(score: number | null): OpportunityLabel {
  if (score === null) return "uncertain";
  if (score >= 82) return "exceptional";
  if (score >= 68) return "attractive";
  if (score >= 45) return "mixed";
  return "weak";
}

export function opportunityWeightsFor(profile: InvestmentProfile) {
  return { ...OPPORTUNITY_WEIGHTS[profile] };
}

export function computeOpportunityAssessment(input: {
  coreScore: number | null;
  mispricingScore: number | null;
  inflectionScore: number | null;
  profile: InvestmentProfile;
}): OpportunityAssessment {
  const weights = OPPORTUNITY_WEIGHTS[input.profile];
  const raw: Array<Omit<OpportunityComponent, "effectiveWeight">> = [
    { id: "core", label: "Core quality", score: finite(input.coreScore) ? clamp(input.coreScore) : null, plannedWeight: weights.core },
    { id: "mispricing", label: "Mispricing", score: finite(input.mispricingScore) ? clamp(input.mispricingScore) : null, plannedWeight: weights.mispricing },
    { id: "inflection", label: "Inflection", score: finite(input.inflectionScore) ? clamp(input.inflectionScore) : null, plannedWeight: weights.inflection },
  ];
  const available = raw.filter((component) => component.score !== null);
  const availableWeight = available.reduce((sum, component) => sum + component.plannedWeight, 0);
  const coverage = availableWeight;
  const score = available.length >= 2 && availableWeight >= 0.4
    ? available.reduce((sum, component) => sum + (component.score as number) * component.plannedWeight, 0) / availableWeight
    : null;
  const components: OpportunityComponent[] = raw.map((component) => ({
    ...component,
    effectiveWeight: component.score === null || availableWeight <= 0 ? 0 : component.plannedWeight / availableWeight,
  }));

  return { score: score === null ? null : clamp(score), coverage, label: labelFor(score), profile: input.profile, components };
}
