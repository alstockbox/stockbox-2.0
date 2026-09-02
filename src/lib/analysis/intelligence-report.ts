import { buildOpportunityView } from "./opportunity-engine";
import type { AnalysisReport } from "./types";

export type IntelligenceSummary = {
  scores: {
    coreQuality: number | null;
    mispricing: number | null;
    inflection: number | null;
    opportunity: number | null;
  };
  confidence: number;
  headline: string;
  thesis: string;
  topDrivers: Array<{ label: string; score: number; source?: string }>;
  blockers: string[];
  missingPillars: string[];
};

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function buildIntelligenceSummary(report: AnalysisReport): IntelligenceSummary {
  const view = buildOpportunityView(report);
  const drivers = [...view.mispricing.signals, ...view.inflection.signals]
    .filter((item) => finite(item.score))
    .sort((left, right) => Math.abs((right.score ?? 50) - 50) * right.weight - Math.abs((left.score ?? 50) - 50) * left.weight)
    .slice(0, 6)
    .map((item) => ({ label: item.label, score: item.score as number, source: item.source }));

  const opportunity = view.opportunityScore;
  const headline = !finite(opportunity)
    ? "StockBox saknar tillräckligt oberoende underlag för en robust opportunity-bedömning."
    : opportunity >= 80 && view.confidence >= 0.75
      ? "Stark opportunity: kvalitet, felprissättning och inflection pekar ovanligt tydligt åt samma håll."
      : opportunity >= 70
        ? "Attraktiv setup: flera oberoende signaler stödjer caset, men risker och confidence måste vägas in."
        : opportunity >= 55
          ? "Intressant men ofullständig setup: vissa signaler är starka medan andra fortfarande behöver bekräftelse."
          : opportunity >= 40
            ? "Blandad setup: StockBox ser både potential och tydliga motargument."
            : "Svag opportunity just nu: kvalitet, värdering eller inflection ger inte tillräckligt stöd tillsammans.";

  return {
    scores: {
      coreQuality: view.coreQuality.score,
      mispricing: view.mispricing.score,
      inflection: view.inflection.score,
      opportunity,
    },
    confidence: view.confidence,
    headline,
    thesis: view.thesis,
    topDrivers: drivers,
    blockers: [...view.mispricing.blockers, ...view.inflection.blockers],
    missingPillars: view.missingPillars,
  };
}
