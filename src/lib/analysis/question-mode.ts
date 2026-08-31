import type { AnalysisReport } from "./types";
import { formatCompactCurrency, formatPercent } from "@/lib/utils/format";
import { buildPeerBenchmarkComparison } from "./peer-benchmark";

export type ResearchQuestionId =
  | "score"
  | "biggest_risk"
  | "bull_case"
  | "bear_case"
  | "peer_benchmark"
  | "priced_in"
  | "watch_next";

export type ResearchQuestion = {
  id: ResearchQuestionId;
  label: string;
};

export const researchQuestions: ResearchQuestion[] = [
  { id: "score", label: "Why is the StockBox Score where it is?" },
  { id: "biggest_risk", label: "What is the biggest risk?" },
  { id: "bull_case", label: "What is the strongest bull argument?" },
  { id: "bear_case", label: "What is the strongest bear argument?" },
  { id: "peer_benchmark", label: "How does it compare with peers?" },
  { id: "priced_in", label: "What appears priced in?" },
  { id: "watch_next", label: "Which metrics should I monitor next?" },
];

function sentenceList(items: string[], fallback: string) {
  return items.length ? items.slice(0, 4).join(" ") : fallback;
}

function scoreExplanation(report: AnalysisReport) {
  const available = report.score.dimensions
    .filter((dimension) => typeof dimension.score === "number" && Number.isFinite(dimension.score))
    .sort((left, right) => (right.score ?? 0) - (left.score ?? 0));
  const strongest = available.slice(0, 3).map((dimension) => `${dimension.label} (${Math.round(dimension.score ?? 0)}/100).`);
  const weakest = available.slice(-2).map((dimension) => `${dimension.label} (${Math.round(dimension.score ?? 0)}/100).`);
  if (report.score.score === null) {
    return `StockBox did not assign an overall score because weighted coverage or methodology support was insufficient. Main missing-data notes: ${report.score.missingData.slice(0, 3).join(", ") || "data unavailable"}.`;
  }
  return `The score is ${Math.round(report.score.score)}/100 with ${Math.round(report.score.confidence)}% confidence. Stronger areas: ${sentenceList(strongest, "no strong scoring contributors were available.")} Weaker or less certain areas: ${sentenceList(weakest, "no weak scoring contributors were available.")}`;
}

export function answerResearchQuestion(report: AnalysisReport, question: ResearchQuestionId): string {
  if (question === "score") return scoreExplanation(report);
  if (question === "biggest_risk") {
    const critical = report.redFlags.find((flag) => flag.severity === "critical") ?? report.redFlags.find((flag) => flag.severity === "high") ?? report.redFlags[0];
    return critical
      ? `${critical.title}: ${critical.detail}`
      : "No deterministic high-severity risk flag was detected from the available data. This does not mean the company has no risk; it means StockBox did not have verified data for a stronger risk claim.";
  }
  if (question === "bull_case") {
    const positives = [
      ...report.greenFlags.map((flag) => `${flag.title}: ${flag.detail}`),
      ...(report.research?.positives.map((signal) => signal.statement) ?? []),
    ];
    return sentenceList(positives, "No strong data-backed bull case was available from this report.");
  }
  if (question === "bear_case") {
    const negatives = [
      ...report.redFlags.map((flag) => `${flag.title}: ${flag.detail}`),
      ...(report.research?.negatives.map((signal) => signal.statement) ?? []),
    ];
    return sentenceList(negatives, "No strong data-backed bear case was available from this report.");
  }
  if (question === "peer_benchmark") {
    const comparison = buildPeerBenchmarkComparison(report);
    if (comparison.status === "unavailable") return comparison.summary;
    const strong = comparison.rows.filter((row) => row.status === "strong").map((row) => row.label);
    const weak = comparison.rows.filter((row) => row.status === "weak").map((row) => row.label);
    return `${comparison.summary} Stronger areas: ${sentenceList(strong.map((item) => `${item}.`), "none identified.")} Weaker areas: ${sentenceList(weak.map((item) => `${item}.`), "none identified.")} This is benchmark-only because live peer constituents are not configured.`;
  }
  if (question === "priced_in") {
    const current = report.engine?.dcf.currentPrice;
    const mid = report.engine?.dcf.mid;
    const currency = report.engine?.dcf.currency ?? report.reportingCurrency ?? undefined;
    if (report.engine?.dcf.status !== "available" || typeof current !== "number" || typeof mid !== "number" || current <= 0) {
      return "StockBox cannot reverse-engineer market expectations because a suitable valuation model or current price is unavailable.";
    }
    const gap = mid / current - 1;
    return `The current price is ${formatCompactCurrency(current, currency)} versus StockBox base-case DCF value of ${formatCompactCurrency(mid, currency)}, implying ${formatPercent(gap)} difference. Treat this as a valuation sensitivity signal, not a precise statement of what the market believes.`;
  }
  const watch = report.researchPlan?.whatToWatch ?? [];
  return sentenceList(watch, "No measurable watch signals were generated from the available data.");
}
