import "server-only";

import type { AnalysisReport } from "../analysis/types";
import { createAdminClient } from "../supabase/admin";
import { ALPHA_MODEL_VERSION } from "./engine";
import {
  rankHiddenGems,
  type AlphaPredictionSnapshot,
  type HiddenGem,
  type HiddenGemsFilters,
} from "./hidden-gems";
import {
  evaluateAlphaOutcome,
  summarizeAlphaOutcomes,
  type AlphaCalibrationSummary,
  type AlphaOutcomeHorizonDays,
} from "./outcomes";
import { buildAlphaPredictionRecord } from "./prediction-snapshot";
import type { AlphaDimensionScores, AlphaProbabilityCurve, AlphaRisk } from "./types";
import type { MarketCapBand } from "./market-cap";

type AnalysisRow = {
  id: string;
  report: unknown;
};

type PredictionRow = {
  id: string;
  analysis_id: string;
  ticker: string;
  company_name: string;
  sector: string | null;
  archetype: string | null;
  market_cap: number | null;
  market_cap_currency: string | null;
  market_cap_band: MarketCapBand;
  fundamental_score: number | null;
  alpha_score: number;
  breakout_score: number;
  classification: AlphaPredictionSnapshot["classification"];
  confidence: number;
  scores: AlphaDimensionScores;
  risk: AlphaRisk;
  probabilities: AlphaProbabilityCurve;
  strongest_signals: string[];
  risk_signals: string[];
  model_version: string;
  prediction_as_of: string;
};

type OutcomePredictionRow = {
  id: string;
  price_at_prediction: number | null;
  prediction_as_of: string;
  probabilities: AlphaProbabilityCurve;
};

function isReport(value: unknown): value is AnalysisReport {
  if (!value || typeof value !== "object") return false;
  const report = value as Partial<AnalysisReport>;
  return typeof report.ticker === "string"
    && typeof report.companyName === "string"
    && typeof report.generatedAt === "string"
    && Boolean(report.score)
    && Boolean(report.metrics);
}

function dbRow(analysisId: string, report: AnalysisReport) {
  const record = buildAlphaPredictionRecord(analysisId, report);
  return {
    analysis_id: record.analysisId,
    ticker: record.ticker,
    company_name: record.companyName,
    sector: record.sector,
    archetype: record.archetype,
    price_at_prediction: record.priceAtPrediction,
    price_currency: record.priceCurrency,
    market_cap: record.marketCap,
    market_cap_currency: record.marketCapCurrency,
    market_cap_band: record.marketCapBand,
    fundamental_score: record.fundamentalScore,
    alpha_score: record.alphaScore,
    breakout_score: record.breakoutScore,
    classification: record.classification,
    confidence: record.confidence,
    scores: record.scores,
    risk: record.risk,
    probabilities: record.probabilities,
    strongest_signals: record.strongestSignals,
    risk_signals: record.riskSignals,
    coverage: record.coverage,
    methodology: record.methodology,
    model_version: record.modelVersion,
    source_report_model_version: record.sourceReportModelVersion,
    prediction_as_of: record.predictionAsOf,
    updated_at: new Date().toISOString(),
  };
}

function snapshot(row: PredictionRow): AlphaPredictionSnapshot {
  return {
    id: row.id,
    analysisId: row.analysis_id,
    ticker: row.ticker,
    companyName: row.company_name,
    sector: row.sector,
    archetype: row.archetype,
    marketCap: row.market_cap,
    marketCapCurrency: row.market_cap_currency,
    marketCapBand: row.market_cap_band,
    fundamentalScore: row.fundamental_score,
    alphaScore: row.alpha_score,
    breakoutScore: row.breakout_score,
    classification: row.classification,
    confidence: row.confidence,
    scores: row.scores,
    risk: row.risk,
    probabilities: row.probabilities,
    strongestSignals: row.strongest_signals,
    riskSignals: row.risk_signals,
    modelVersion: row.model_version,
    predictionAsOf: row.prediction_as_of,
  };
}

function horizonKey(days: AlphaOutcomeHorizonDays): keyof AlphaProbabilityCurve {
  if (days === 30) return "oneMonth";
  if (days === 90) return "threeMonths";
  if (days === 180) return "sixMonths";
  return "twelveMonths";
}

export async function syncRecentAlphaPredictions(limit = 300): Promise<{
  ok: boolean;
  scanned: number;
  written: number;
  skipped: number;
}> {
  const supabase = createAdminClient();
  if (!supabase) return { ok: false, scanned: 0, written: 0, skipped: 0 };

  const boundedLimit = Math.min(1000, Math.max(1, Math.floor(limit)));
  const analysesResult = await supabase
    .from("analyses")
    .select("id,report")
    .order("created_at", { ascending: false })
    .limit(boundedLimit);

  if (analysesResult.error || !analysesResult.data?.length) {
    return { ok: !analysesResult.error, scanned: 0, written: 0, skipped: 0 };
  }

  const analyses = analysesResult.data as AnalysisRow[];
  const ids = analyses.map((row) => row.id);
  const existingResult = await supabase
    .from("alpha_predictions")
    .select("analysis_id")
    .eq("model_version", ALPHA_MODEL_VERSION)
    .in("analysis_id", ids);

  if (existingResult.error) {
    return { ok: false, scanned: analyses.length, written: 0, skipped: 0 };
  }

  const existing = new Set((existingResult.data ?? []).map((row) => String(row.analysis_id)));
  const rows: ReturnType<typeof dbRow>[] = [];
  let skipped = 0;

  for (const analysis of analyses) {
    if (existing.has(analysis.id)) {
      skipped += 1;
      continue;
    }
    if (!isReport(analysis.report)) {
      skipped += 1;
      continue;
    }
    try {
      rows.push(dbRow(analysis.id, analysis.report));
    } catch {
      skipped += 1;
    }
  }

  if (!rows.length) {
    return { ok: true, scanned: analyses.length, written: 0, skipped };
  }

  const writeResult = await supabase
    .from("alpha_predictions")
    .upsert(rows, { onConflict: "analysis_id,model_version", ignoreDuplicates: false });

  if (writeResult.error) {
    return { ok: false, scanned: analyses.length, written: 0, skipped };
  }

  return { ok: true, scanned: analyses.length, written: rows.length, skipped };
}

export async function getAlphaPredictionSnapshots(limit = 600): Promise<AlphaPredictionSnapshot[]> {
  const supabase = createAdminClient();
  if (!supabase) return [];

  const boundedLimit = Math.min(2000, Math.max(1, Math.floor(limit)));
  const result = await supabase
    .from("alpha_predictions")
    .select("id,analysis_id,ticker,company_name,sector,archetype,market_cap,market_cap_currency,market_cap_band,fundamental_score,alpha_score,breakout_score,classification,confidence,scores,risk,probabilities,strongest_signals,risk_signals,model_version,prediction_as_of")
    .order("prediction_as_of", { ascending: false })
    .limit(boundedLimit);

  if (result.error || !result.data) return [];
  return (result.data as PredictionRow[]).map(snapshot);
}

export async function recordAlphaPredictionOutcome(input: {
  predictionId: string;
  horizonDays: AlphaOutcomeHorizonDays;
  priceEnd: number;
  marketDataAsOf: string;
  benchmarkSymbol?: string | null;
  benchmarkReturn?: number | null;
}): Promise<{ ok: boolean; reason?: "unavailable" | "prediction_not_found" | "not_evaluable" | "write_failed" }> {
  const supabase = createAdminClient();
  if (!supabase) return { ok: false, reason: "unavailable" };

  const predictionResult = await supabase
    .from("alpha_predictions")
    .select("id,price_at_prediction,prediction_as_of,probabilities")
    .eq("id", input.predictionId)
    .maybeSingle();

  if (predictionResult.error || !predictionResult.data) {
    return { ok: false, reason: "prediction_not_found" };
  }

  const prediction = predictionResult.data as OutcomePredictionRow;
  if (prediction.price_at_prediction === null) {
    return { ok: false, reason: "not_evaluable" };
  }
  const probabilities = prediction.probabilities?.[horizonKey(input.horizonDays)];
  if (!probabilities || typeof probabilities.up25 !== "number") {
    return { ok: false, reason: "not_evaluable" };
  }

  const evaluated = evaluateAlphaOutcome({
    predictionId: prediction.id,
    predictionAsOf: prediction.prediction_as_of,
    horizonDays: input.horizonDays,
    priceStart: prediction.price_at_prediction,
    priceEnd: input.priceEnd,
    marketDataAsOf: input.marketDataAsOf,
    predictedUp25: probabilities.up25,
    benchmarkSymbol: input.benchmarkSymbol,
    benchmarkReturn: input.benchmarkReturn,
  });
  if (!evaluated) return { ok: false, reason: "not_evaluable" };

  const writeResult = await supabase.from("alpha_prediction_outcomes").upsert({
    prediction_id: evaluated.predictionId,
    horizon_days: evaluated.horizonDays,
    price_start: evaluated.priceStart,
    price_end: evaluated.priceEnd,
    observed_return: evaluated.observedReturn,
    benchmark_symbol: evaluated.benchmarkSymbol,
    benchmark_return: evaluated.benchmarkReturn,
    market_data_as_of: evaluated.marketDataAsOf,
    evaluated_at: new Date().toISOString(),
  }, { onConflict: "prediction_id,horizon_days", ignoreDuplicates: false });

  return writeResult.error ? { ok: false, reason: "write_failed" } : { ok: true };
}

export async function getAlphaTrackRecord(horizonDays: AlphaOutcomeHorizonDays = 180): Promise<AlphaCalibrationSummary> {
  const supabase = createAdminClient();
  if (!supabase) return summarizeAlphaOutcomes([]);

  const outcomeResult = await supabase
    .from("alpha_prediction_outcomes")
    .select("prediction_id,observed_return")
    .eq("horizon_days", horizonDays)
    .order("evaluated_at", { ascending: false })
    .limit(2000);
  if (outcomeResult.error || !outcomeResult.data?.length) return summarizeAlphaOutcomes([]);

  const predictionIds = outcomeResult.data.map((row) => String(row.prediction_id));
  const predictionResult = await supabase
    .from("alpha_predictions")
    .select("id,probabilities")
    .in("id", predictionIds);
  if (predictionResult.error || !predictionResult.data) return summarizeAlphaOutcomes([]);

  const probabilityById = new Map(
    predictionResult.data.map((row) => [String(row.id), (row.probabilities as AlphaProbabilityCurve)?.[horizonKey(horizonDays)]?.up25]),
  );
  const outcomes = outcomeResult.data.flatMap((row) => {
    const observedReturn = Number(row.observed_return);
    const predictedUp25 = probabilityById.get(String(row.prediction_id));
    if (!Number.isFinite(observedReturn) || typeof predictedUp25 !== "number" || !Number.isFinite(predictedUp25)) return [];
    return [{ observedReturn, predictedUp25, hitUp25: observedReturn >= 0.25 }];
  });

  return summarizeAlphaOutcomes(outcomes);
}

export async function getHiddenGems(filters: HiddenGemsFilters): Promise<{
  ok: boolean;
  rows: HiddenGem[];
  universeSize: number;
  materialization: { ok: boolean; scanned: number; written: number; skipped: number };
}> {
  const materialization = await syncRecentAlphaPredictions();
  const snapshots = await getAlphaPredictionSnapshots();
  return {
    ok: materialization.ok || snapshots.length > 0,
    rows: rankHiddenGems(snapshots, filters),
    universeSize: new Set(snapshots.map((row) => row.ticker.toUpperCase())).size,
    materialization,
  };
}
