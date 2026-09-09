import type { AnalysisReport } from "../analysis/types";
import { computeAlphaIntelligence } from "./engine";
import { buildAlphaSignalInputFromReport } from "./report-adapter";
import type { AlphaIntelligenceResult } from "./types";

export type AlphaPredictionRecord = {
  analysisId: string;
  ticker: string;
  companyName: string;
  sector: string | null;
  archetype: string | null;
  priceAtPrediction: number | null;
  priceCurrency: string | null;
  marketCap: number | null;
  marketCapCurrency: string | null;
  marketCapBand: AlphaIntelligenceResult["marketCapBand"];
  fundamentalScore: number | null;
  alphaScore: number;
  breakoutScore: number;
  classification: AlphaIntelligenceResult["classification"];
  confidence: number;
  scores: AlphaIntelligenceResult["scores"];
  risk: AlphaIntelligenceResult["risk"];
  probabilities: AlphaIntelligenceResult["probabilities"];
  strongestSignals: string[];
  riskSignals: string[];
  coverage: AlphaIntelligenceResult["coverage"];
  methodology: AlphaIntelligenceResult["methodology"];
  modelVersion: string;
  sourceReportModelVersion: string | null;
  predictionAsOf: string;
};

export function buildAlphaPredictionRecord(analysisId: string, report: AnalysisReport): AlphaPredictionRecord {
  const input = buildAlphaSignalInputFromReport(report);
  const alpha = computeAlphaIntelligence(input);

  return {
    analysisId,
    ticker: report.ticker,
    companyName: report.companyName,
    sector: input.sector ?? null,
    archetype: input.archetype ?? null,
    priceAtPrediction: report.market?.price ?? null,
    priceCurrency: report.market?.currency ?? null,
    marketCap: input.market.marketCap,
    marketCapCurrency: input.market.marketCapCurrency ?? null,
    marketCapBand: alpha.marketCapBand,
    fundamentalScore: report.score.score,
    alphaScore: alpha.alphaScore,
    breakoutScore: alpha.scores.breakoutProbability,
    classification: alpha.classification,
    confidence: alpha.confidence,
    scores: alpha.scores,
    risk: alpha.risk,
    probabilities: alpha.probabilities,
    strongestSignals: alpha.strongestSignals,
    riskSignals: alpha.riskSignals,
    coverage: alpha.coverage,
    methodology: alpha.methodology,
    modelVersion: alpha.modelVersion,
    sourceReportModelVersion: report.modelVersion ?? null,
    predictionAsOf: alpha.generatedAt,
  };
}
