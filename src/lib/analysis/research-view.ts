import type { AnalysisReport } from "./types";
import type { Locale } from "@/lib/i18n/types";

export type OverallResearchView = "Insufficient data" | "Weak" | "Mixed" | "Solid" | "Strong";

export function overallResearchView(input: {
  score: number | null | undefined;
  confidence: number | null | undefined;
  coverage?: number | null;
}): OverallResearchView {
  const score = input.score;
  const confidence = input.confidence;
  const coverage = input.coverage;
  if (typeof score !== "number" || !Number.isFinite(score)) return "Insufficient data";
  if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 40) return "Insufficient data";
  if (typeof coverage === "number" && Number.isFinite(coverage) && coverage < 0.55) return "Insufficient data";
  if (score >= 75) return "Strong";
  if (score >= 60) return "Solid";
  if (score >= 42) return "Mixed";
  return "Weak";
}

export function researchViewForReport(report: AnalysisReport): OverallResearchView {
  return overallResearchView({
    score: report.score.personalizedScore ?? report.score.score,
    confidence: report.score.confidence,
    coverage: report.dataCoverage,
  });
}

export function researchViewCopy(report: AnalysisReport, locale: Locale) {
  const view = researchViewForReport(report);
  const score = report.score.personalizedScore ?? report.score.score;
  const confidence = Math.round(report.score.confidence);
  if (report.dataStatus === "stale") {
    return locale === "sv"
      ? {
          oneSentence: "De senaste tillförlitliga finansiella rapporterna är för gamla för en aktuell bedömning.",
          summary: "StockBox blockerar aktuella slutsatser när den senaste tillförlitliga fundamentadatan passerar freshness-gränsen. Historiska fakta och begränsningar visas fortfarande.",
        }
      : {
          oneSentence: "The latest reliable financial statements are too old for a current assessment.",
          summary: "StockBox blocks current conclusions when the latest reliable fundamentals exceed the freshness threshold. Historical facts and limitations remain visible.",
        };
  }
  if (view === "Insufficient data" || typeof score !== "number" || !Number.isFinite(score)) {
    return locale === "sv"
      ? {
          oneSentence: `${report.companyName} har otillräcklig viktad datatäckning för en övergripande researchvy.`,
          summary: "StockBox har inte tillräckligt med lämplig, avstämd data för en övergripande researchvy. Tillgängliga fakta och orsaker till saknad data förblir synliga.",
        }
      : {
          oneSentence: `${report.companyName} has insufficient weighted data coverage for an overall research view.`,
          summary: "StockBox does not have enough suitable, reconciled data for an overall research view. Available facts and missing-data reasons remain visible.",
        };
  }
  const localized = localizedResearchView(view, locale).toLowerCase();
  return locale === "sv"
    ? {
        oneSentence: `${report.companyName} har en ${localized} övergripande researchvy med StockBox Score ${Math.round(score)}/100 och ${confidence}% konfidens.`,
        summary: `Den ${localized} researchvyn kombinerar StockBox versionsstyrda dimensioner samtidigt som bolagskvalitet, värdering, risk och datakonfidens hålls synliga var för sig.`,
      }
    : {
        oneSentence: `${report.companyName} has a ${localized} overall research view with a StockBox Score of ${Math.round(score)}/100 and ${confidence}% confidence.`,
        summary: `The ${localized} research view combines the versioned StockBox dimensions while keeping business quality, valuation, risk and data confidence visible separately.`,
      };
}

export function localizedResearchView(view: OverallResearchView, locale: Locale): string {
  if (locale !== "sv") return view;
  return {
    "Insufficient data": "Otillräcklig data",
    Weak: "Svag",
    Mixed: "Blandad",
    Solid: "Stabil",
    Strong: "Stark",
  }[view];
}
