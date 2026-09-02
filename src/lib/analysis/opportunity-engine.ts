import { buildInflectionScore } from "./inflection-engine";
import { buildMispricingScore } from "./mispricing-engine";
import type { AnalysisReport } from "./types";

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export type OpportunityView = {
  coreQuality: {
    score: number | null;
    confidence: number;
  };
  mispricing: ReturnType<typeof buildMispricingScore>;
  inflection: ReturnType<typeof buildInflectionScore>;
  opportunityScore: number | null;
  confidence: number;
  missingPillars: string[];
  thesis: string;
};

export function buildOpportunityView(report: AnalysisReport): OpportunityView {
  const coreQuality = {
    score: report.score.score,
    confidence: Math.max(0, Math.min(1, report.score.confidence / 100)),
  };
  const mispricing = buildMispricingScore(report);
  const inflection = buildInflectionScore(report);

  const pillars = [
    { id: "core quality", score: coreQuality.score, confidence: coreQuality.confidence, weight: 0.4 },
    { id: "mispricing", score: mispricing.score, confidence: mispricing.confidence, weight: 0.35 },
    { id: "inflection", score: inflection.score, confidence: inflection.confidence, weight: 0.25 },
  ];
  const available = pillars.filter((item) => finite(item.score));
  const missingPillars = pillars.filter((item) => !finite(item.score)).map((item) => item.id);

  if (available.length < 2) {
    return {
      coreQuality,
      mispricing,
      inflection,
      opportunityScore: null,
      confidence: Math.min(0.35, available[0]?.confidence ?? 0),
      missingPillars,
      thesis: "Insufficient independent evidence to form an opportunity view.",
    };
  }

  const totalWeight = available.reduce((sum, item) => sum + item.weight, 0);
  const weightedAverage = available.reduce((sum, item) => sum + (item.score as number) * item.weight, 0) / totalWeight;
  const weakest = Math.min(...available.map((item) => item.score as number));
  const conservativeBlend = weightedAverage * 0.8 + weakest * 0.2;
  const opportunityScore = Math.max(0, Math.min(100, conservativeBlend));
  const confidenceBase = available.reduce((sum, item) => sum + item.confidence * item.weight, 0) / totalWeight;
  const coveragePenalty = available.length / pillars.length;
  const confidence = Math.max(0, Math.min(1, confidenceBase * coveragePenalty));

  const thesis = opportunityScore >= 75
    ? "Multiple independent pillars support an attractive opportunity, subject to the listed blockers and confidence level."
    : opportunityScore >= 60
      ? "The setup is constructive but not uniformly strong across quality, valuation and inflection."
      : opportunityScore >= 45
        ? "Evidence is mixed; the opportunity case needs stronger confirmation or a larger valuation cushion."
        : "The current combination of quality, valuation and inflection does not support a strong opportunity case.";

  return {
    coreQuality,
    mispricing,
    inflection,
    opportunityScore,
    confidence,
    missingPillars,
    thesis,
  };
}
