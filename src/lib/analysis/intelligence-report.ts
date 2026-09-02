import { buildIntelligenceSnapshot } from "./intelligence-snapshot";
import type { AnalysisReport } from "./types";
import type { Locale } from "@/lib/i18n/types";

export type IntelligenceSummary = {
  scores: {
    coreQuality: number | null;
    canonicalCoreQuality: number | null;
    mispricing: number | null;
    inflection: number | null;
    opportunity: number | null;
  };
  coverage: {
    mispricing: number;
    inflection: number;
    opportunity: number;
  };
  confidence: number;
  headline: string;
  thesis: string;
  mispricing: {
    label: ReturnType<typeof buildIntelligenceSnapshot>["mispricing"]["label"];
    valueTrapRisk: ReturnType<typeof buildIntelligenceSnapshot>["mispricing"]["valueTrapRisk"];
  };
  inflection: {
    stage: ReturnType<typeof buildIntelligenceSnapshot>["inflection"]["stage"];
    overextensionRisk: ReturnType<typeof buildIntelligenceSnapshot>["inflection"]["overextensionRisk"];
  };
  opportunity: {
    label: ReturnType<typeof buildIntelligenceSnapshot>["opportunity"]["label"];
    profile: ReturnType<typeof buildIntelligenceSnapshot>["opportunity"]["profile"];
  };
  topDrivers: Array<{ label: string; score: number; source: string }>;
  blockers: string[];
  missingPillars: string[];
};

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function mispricingSource(id: string): string {
  if (id === "intrinsic_value") return "StockBox DCF";
  if (id === "historical_self_valuation") return "StockBox historical valuation";
  if (id === "peer_relative_valuation") return "StockBox peer valuation";
  return "StockBox archetype-aware valuation";
}

function inflectionSource(family: string): string {
  if (family === "fundamental") return "Fundamental acceleration";
  if (family === "expectations") return "Forward expectations";
  if (family === "market") return "Market confirmation";
  if (family === "funding") return "Funding & survival quality";
  return "Research catalysts";
}

function headlineFor(
  score: number | null,
  confidence: number,
  locale: Locale,
): string {
  if (locale === "sv") {
    if (!finite(score)) return "Otillräckligt oberoende underlag för en robust opportunity-bedömning.";
    if (score >= 82 && confidence >= 0.72) return "Exceptionell setup: kvalitet, felprissättning och inflection stödjer samma case med hög samlad confidence.";
    if (score >= 68) return "Attraktiv setup: flera oberoende signaler stödjer caset, men risker och datatäckning måste vägas in.";
    if (score >= 45) return "Blandad setup: StockBox ser potential, men evidensen är ännu inte tillräckligt samstämmig.";
    return "Svag opportunity just nu: kvalitet, värdering eller inflection ger inte tillräckligt stöd tillsammans.";
  }
  if (!finite(score)) return "Insufficient independent evidence for a robust opportunity assessment.";
  if (score >= 82 && confidence >= 0.72) return "Exceptional setup: quality, mispricing and inflection support the same case with high combined confidence.";
  if (score >= 68) return "Attractive setup: several independent signals support the case, but risks and data coverage still matter.";
  if (score >= 45) return "Mixed setup: StockBox sees potential, but the evidence is not yet sufficiently aligned.";
  return "Weak opportunity at present: quality, valuation or inflection do not provide enough combined support.";
}

function thesisFor(
  opportunityLabel: ReturnType<typeof buildIntelligenceSnapshot>["opportunity"]["label"],
  inflectionStage: ReturnType<typeof buildIntelligenceSnapshot>["inflection"]["stage"],
  valueTrapRisk: ReturnType<typeof buildIntelligenceSnapshot>["mispricing"]["valueTrapRisk"],
  locale: Locale,
): string {
  if (locale === "sv") {
    const stage = inflectionStage === "confirming"
      ? "Fundamental och marknadsmässig acceleration bekräftar varandra."
      : inflectionStage === "building"
        ? "Inflection-caset byggs men behöver mer bekräftelse."
        : inflectionStage === "extended"
          ? "Momentum är starkt men prisrörelsen är utsträckt, vilket sänker conviction."
          : inflectionStage === "fragile"
            ? "Finansiell fragilitet blockerar ett hög-conviction inflection-case."
            : "Inflection-signalerna är ännu begränsade eller blandade.";
    const trap = valueTrapRisk === "high"
      ? " Value-trap-risken är hög och rabatten ska därför inte tolkas isolerat."
      : valueTrapRisk === "medium"
        ? " Value-trap-risken är måttlig och kräver extra kontroll av försämrade fundamenta."
        : " Value-trap-risken är låg utifrån tillgänglig evidens.";
    return `${stage}${trap} Opportunity-klassen är ${opportunityLabel}.`;
  }
  const stage = inflectionStage === "confirming"
    ? "Fundamental and market acceleration are confirming each other."
    : inflectionStage === "building"
      ? "The inflection case is building but still needs more confirmation."
      : inflectionStage === "extended"
        ? "Momentum is strong but price action is extended, reducing conviction."
        : inflectionStage === "fragile"
          ? "Financial fragility blocks a high-conviction inflection case."
          : "Inflection evidence remains limited or mixed.";
  const trap = valueTrapRisk === "high"
    ? " Value-trap risk is high, so the apparent discount should not be interpreted in isolation."
    : valueTrapRisk === "medium"
      ? " Value-trap risk is moderate and requires extra scrutiny of deteriorating fundamentals."
      : " Value-trap risk is low based on available evidence.";
  return `${stage}${trap} The opportunity classification is ${opportunityLabel}.`;
}

export function buildIntelligenceSummary(report: AnalysisReport, locale: Locale = "en"): IntelligenceSummary {
  const snapshot = buildIntelligenceSnapshot(report, report.investmentProfile);
  const coreConfidence = clampUnit(report.score.confidence / 100);
  const mispricingConfidence = clampUnit(snapshot.mispricing.confidence / 100);
  const inflectionConfidence = clampUnit(snapshot.inflection.confidence / 100);
  const opportunityCoverage = clampUnit(snapshot.opportunity.coverage);
  const confidence = clampUnit(
    (coreConfidence * 0.4 + mispricingConfidence * 0.3 + inflectionConfidence * 0.3) * opportunityCoverage,
  );

  const mispricingDrivers = snapshot.mispricing.pillars
    .filter((pillar) => finite(pillar.score))
    .map((pillar) => ({
      label: pillar.label,
      score: pillar.score as number,
      source: mispricingSource(pillar.id),
      importance: Math.abs((pillar.score as number) - 50) * pillar.weight,
    }));
  const inflectionDrivers = snapshot.inflection.signals
    .filter((signal) => finite(signal.score))
    .map((signal) => ({
      label: signal.label,
      score: signal.score as number,
      source: inflectionSource(signal.family),
      importance: Math.abs((signal.score as number) - 50) * signal.weight,
    }));
  const topDrivers = [...mispricingDrivers, ...inflectionDrivers]
    .sort((left, right) => right.importance - left.importance)
    .slice(0, 6)
    .map((driver) => ({ label: driver.label, score: driver.score, source: driver.source }));

  const missingPillars = snapshot.opportunity.components
    .filter((component) => component.score === null)
    .map((component) => component.id);

  return {
    scores: {
      coreQuality: snapshot.lensCoreScore,
      canonicalCoreQuality: snapshot.canonicalCoreScore,
      mispricing: snapshot.mispricing.score,
      inflection: snapshot.inflection.score,
      opportunity: snapshot.opportunity.score,
    },
    coverage: {
      mispricing: snapshot.mispricing.coverage,
      inflection: snapshot.inflection.coverage,
      opportunity: snapshot.opportunity.coverage,
    },
    confidence,
    headline: headlineFor(snapshot.opportunity.score, confidence, locale),
    thesis: thesisFor(snapshot.opportunity.label, snapshot.inflection.stage, snapshot.mispricing.valueTrapRisk, locale),
    mispricing: {
      label: snapshot.mispricing.label,
      valueTrapRisk: snapshot.mispricing.valueTrapRisk,
    },
    inflection: {
      stage: snapshot.inflection.stage,
      overextensionRisk: snapshot.inflection.overextensionRisk,
    },
    opportunity: {
      label: snapshot.opportunity.label,
      profile: snapshot.opportunity.profile,
    },
    topDrivers,
    blockers: [...snapshot.mispricing.counterEvidence, ...snapshot.inflection.brakes],
    missingPillars,
  };
}
