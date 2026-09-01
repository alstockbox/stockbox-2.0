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

function localizedConstraintReason(reason: string | undefined, locale: Locale): string | null {
  if (!reason) return null;
  if (locale !== "sv") return reason;
  const translations: Record<string, string> = {
    "Directional ratings require adequate valuation coverage.": "En riktad rating kräver tillräcklig värderingstäckning.",
    "Buy requires positive valuation support.": "Buy kräver positivt värderingsstöd vid aktuell kurs.",
    "Strong Buy requires meaningful valuation support.": "Strong Buy kräver tydligt positivt värderingsstöd.",
    "Sell requires negative valuation support.": "Sell kräver negativt värderingsstöd vid aktuell kurs.",
    "Strong Sell requires meaningful downside support.": "Strong Sell kräver tydligt negativt nedsidestöd.",
    "Buy and Sell require confidence of at least 55.": "Buy och Sell kräver minst 55% konfidens.",
    "Critical unresolved red flags prevent Buy ratings.": "Kritiska olösta varningsflaggor blockerar Buy-rating.",
    "Unresolved high-severity red flags prevent Strong Buy.": "Olösta varningsflaggor med hög allvarlighetsgrad blockerar Strong Buy.",
  };
  return translations[reason] ?? reason;
}

export function legacyRatingContext(input: {
  view: OverallResearchView;
  rating?: string | null;
  constraints?: string[] | null;
  locale: Locale;
}): string | null {
  const { view, rating, constraints, locale } = input;
  if (!rating || rating === "No Rating" || view === "Insufficient data") return null;
  const reason = localizedConstraintReason(constraints?.[0], locale);
  const strongViewWithHold = rating === "Hold" && (view === "Strong" || view === "Solid");
  if (!strongViewWithHold) return null;

  return locale === "sv"
    ? `Den separata legacy-ratingen kan samtidigt vara Hold. Den är en pris- och värderingssignal, inte samma sak som Research View.${reason ? ` Orsak: ${reason}` : ""}`
    : `The separate legacy model rating can still be Hold. It is a price-and-valuation signal, not the same thing as the Research View.${reason ? ` Reason: ${reason}` : ""}`;
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
  const ratingContext = legacyRatingContext({
    view,
    rating: report.recommendation,
    constraints: report.engine?.recommendation?.constraintsApplied,
    locale,
  });
  return locale === "sv"
    ? {
        oneSentence: `${report.companyName} har en ${localized} övergripande researchvy med StockBox Score ${Math.round(score)}/100 och ${confidence}% konfidens.`,
        summary: `Den ${localized} researchvyn kombinerar StockBox versionsstyrda dimensioner samtidigt som bolagskvalitet, värdering, risk och datakonfidens hålls synliga var för sig.${ratingContext ? ` ${ratingContext}` : ""}`,
      }
    : {
        oneSentence: `${report.companyName} has a ${localized} overall research view with a StockBox Score of ${Math.round(score)}/100 and ${confidence}% confidence.`,
        summary: `The ${localized} research view combines the versioned StockBox dimensions while keeping business quality, valuation, risk and data confidence visible separately.${ratingContext ? ` ${ratingContext}` : ""}`,
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
