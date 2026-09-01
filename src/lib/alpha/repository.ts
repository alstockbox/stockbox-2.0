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
