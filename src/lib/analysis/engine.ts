import { randomUUID } from "node:crypto";
import { MODEL_VERSION } from "./config";
import { calculateDcf, calculateMetrics, latestAnnual } from "./calculations";
import { computeDcfRange } from "./dcf";
import { detectFinancialRedFlags, detectGreenFlags, detectRedFlags } from "./flags";
import { computeFinancialMetrics } from "./metrics";
import { deriveRecommendation, recommend } from "./recommendation";
import { computeScores, scoreAnalysis } from "./scoring";
import { buildAnalysisScenarios, buildScenarios } from "./scenarios";
import type { AnalysisInput, AnalysisReport, FinancialAnalysisInput, FinancialAnalysisResult, MissingDataItem } from "./types";

function sentenceFor(report: Pick<AnalysisReport, "companyName" | "recommendation">, score: number, confidence: number) {
  return `${report.companyName} receives a ${report.recommendation} model assessment with a StockBox Score of ${score}/100 and ${confidence}% confidence.`;
}

function summarize(report: Pick<AnalysisReport, "companyName" | "recommendation" | "redFlags" | "greenFlags">) {
  const positives = report.greenFlags.map((flag) => flag.title.toLowerCase()).slice(0, 2);
  const negatives = report.redFlags.map((flag) => flag.title.toLowerCase()).slice(0, 2);

  if (positives.length === 0 && negatives.length === 0) {
    return `${report.companyName} has insufficient complete data for a high-conviction view. StockBox shows the available facts and keeps the assessment cautious.`;
  }

  return `${report.companyName} is assessed as ${report.recommendation}. Key positives include ${positives.join(", ") || "limited identifiable strengths"}, while risks include ${negatives.join(", ") || "no major deterministic red flags detected"}.`;
}

export function buildAnalysis(input: AnalysisInput): AnalysisReport {
  const latest = input.fundamentals ? latestAnnual(input.fundamentals.annual) : null;
  const estimatedMarketCap =
    latest?.epsDiluted && input.market?.price && latest.netIncome
      ? (latest.netIncome / latest.epsDiluted) * input.market.price
      : null;

  const metrics = input.fundamentals
    ? calculateMetrics(input.fundamentals.annual, input.market?.price ?? null, estimatedMarketCap, {
        "1Y": input.market?.performance["1Y"] ?? undefined,
        "3M": input.market?.performance["3M"] ?? undefined
      })
    : calculateMetrics([], input.market?.price ?? null, null, {});

  const score = scoreAnalysis(metrics, input.investmentProfile);
  const redFlags = detectRedFlags(metrics);
  const greenFlags = detectGreenFlags(metrics);
  const recommendation = recommend(score, redFlags);
  const dcf =
    metrics.fcf && metrics.fcf > 0
      ? calculateDcf({
          startingFcf: metrics.fcf,
          years: 10,
          growthRate: Math.min(Math.max(metrics.revenueCagr3y ?? 0.03, -0.01), 0.12),
          discountRate: 0.095,
          terminalGrowthRate: 0.025,
          marginOfSafety: 0.15
        })
      : {
          suitable: false,
          reason: "DCF is unavailable because positive free cash flow is missing.",
          bear: null,
          base: null,
          bull: null
        };

  const partial = {
    companyName: input.company.name,
    recommendation,
    redFlags,
    greenFlags
  };

  const report: AnalysisReport = {
    id: randomUUID(),
    ticker: input.company.ticker,
    companyName: input.company.name,
    analysisType: input.analysisType,
    investmentProfile: input.investmentProfile,
    generatedAt: new Date().toISOString(),
    oneSentence: "",
    summary: summarize(partial),
    recommendation,
    shortTermAssessment:
      metrics.priceMomentum3m !== null && metrics.priceMomentum3m > 0.08
        ? "Short-term momentum is constructive, but should be weighed against valuation and news risk."
        : "Short-term conditions are mixed or data-limited, so StockBox does not assign high near-term conviction.",
    longTermAssessment:
      score.score >= 70
        ? "Long-term quality appears favorable based on available fundamentals, provided cash flow and balance-sheet discipline persist."
        : "Long-term conviction is constrained by missing data, weaker fundamentals, or unresolved red flags.",
    metrics,
    score,
    dcf,
    redFlags,
    greenFlags,
    scenarios: buildScenarios(metrics, score.confidence),
    sources: [],
    disclaimer:
      "StockBox is an analytical tool. Scores and model assessments depend on available data, assumptions, and historical relationships. They are not individualized financial advice or guaranteed outcomes."
  };

  report.oneSentence = sentenceFor(report, score.score, score.confidence);

  return report;
}

export function analyzeFinancials(input: FinancialAnalysisInput): FinancialAnalysisResult {
  const metrics = computeFinancialMetrics(input);
  const scores = computeScores(input, metrics);
  const redFlags = detectFinancialRedFlags(metrics);
  const recommendation = deriveRecommendation(scores, redFlags);
  const dcf = computeDcfRange(input, metrics);
  const scenarios = buildAnalysisScenarios(metrics, scores, dcf);
  const allMissing = [...metrics.missingData, ...scores.missingData, ...dcf.missingData];
  const uniqueMissing = new Map<string, MissingDataItem>();

  for (const item of allMissing) {
    uniqueMissing.set(`${item.field}:${item.impact}`, item);
  }

  return {
    modelVersion: MODEL_VERSION,
    metrics,
    scores,
    redFlags,
    recommendation,
    dcf,
    scenarios,
    missingData: [...uniqueMissing.values()],
  };
}
