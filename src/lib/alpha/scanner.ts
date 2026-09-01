import "server-only";

import type { AnalysisReport, CompanySearchResult } from "../analysis/types";
import { analyzeCompany, searchCompanies } from "../data/enhanced-provider";
import { canAttemptConfiguredFundamentals } from "../data/security-classification";
import { createAdminClient } from "../supabase/admin";
import { ALPHA_MODEL_VERSION, computeAlphaIntelligence } from "./engine";
import { buildAlphaSignalInputFromReport } from "./report-adapter";
import { selectScannerCandidates } from "./scan-policy";
import { getUniverseCandidates, type AlphaUniverseCandidate } from "./universe-repository";

export type AlphaUniverseScanResult = {
  ok: boolean;
  runId: string | null;
  requested: number;
  candidates: number;
  analyzed: number;
  predictions: number;
  skipped: number;
  failed: number;
  failures: Array<{ ticker: string; reason: string }>;
};

function exactCompany(candidates: CompanySearchResult[], universe: AlphaUniverseCandidate): CompanySearchResult | null {
  const ticker = universe.ticker.trim().toUpperCase();
  const matches = candidates.filter((candidate) => {
    const symbols = [candidate.ticker, candidate.canonicalTicker]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.trim().toUpperCase());
    return symbols.includes(ticker);
  });

  const eligible = matches.filter((candidate) => {
    if (candidate.securityType && candidate.securityType !== "Common Stock") return false;
    if (universe.country && candidate.country && candidate.country.toUpperCase() !== universe.country.toUpperCase()) return false;
    return canAttemptConfiguredFundamentals(candidate);
  });

  if (eligible.length !== 1) return null;
  return eligible[0] ?? null;
}

function predictionRow(
  universe: AlphaUniverseCandidate,
  scanRunId: string,
  report: AnalysisReport,
) {
  const input = buildAlphaSignalInputFromReport(report);
  const alpha = computeAlphaIntelligence(input);
  return {
    analysis_id: null,
    universe_security_id: universe.id,
    scan_run_id: scanRunId,
    ticker: report.ticker,
    company_name: report.companyName,
    sector: input.sector ?? null,
    archetype: input.archetype ?? null,
    price_at_prediction: report.market?.price ?? null,
    price_currency: report.market?.currency ?? null,
    market_cap: input.market.marketCap,
    market_cap_currency: input.market.marketCapCurrency ?? null,
    market_cap_band: alpha.marketCapBand,
    fundamental_score: report.score.score,
    alpha_score: alpha.alphaScore,
    breakout_score: alpha.scores.breakoutProbability,
    classification: alpha.classification,
    confidence: alpha.confidence,
    scores: alpha.scores,
    risk: alpha.risk,
    probabilities: alpha.probabilities,
    strongest_signals: alpha.strongestSignals,
    risk_signals: alpha.riskSignals,
    coverage: alpha.coverage,
    methodology: alpha.methodology,
    model_version: alpha.modelVersion,
    source_report_model_version: report.modelVersion ?? null,
    prediction_as_of: alpha.generatedAt,
    updated_at: new Date().toISOString(),
  };
}

async function createRun(requestedLimit: number) {
  const supabase = createAdminClient();
  if (!supabase) return null;
  const result = await supabase
    .from("alpha_scan_runs")
    .insert({
      source: "nasdaq_trader_us_equities",
      model_version: ALPHA_MODEL_VERSION,
      status: "running",
      requested_limit: requestedLimit,
    })
    .select("id")
    .single();
  return result.error || !result.data ? null : String(result.data.id);
}

async function finishRun(runId: string, result: Omit<AlphaUniverseScanResult, "ok" | "runId" | "requested" | "failures">) {
  const supabase = createAdminClient();
  if (!supabase) return;
  const status = result.failed === 0 ? "completed" : result.predictions > 0 ? "partial" : "failed";
  await supabase.from("alpha_scan_runs").update({
    status,
    candidate_count: result.candidates,
    analyzed_count: result.analyzed,
    prediction_count: result.predictions,
    skipped_count: result.skipped,
    failed_count: result.failed,
    completed_at: new Date().toISOString(),
  }).eq("id", runId);
}

export async function runAlphaUniverseScan(options: {
  limit?: number;
  refreshAfterHours?: number;
} = {}): Promise<AlphaUniverseScanResult> {
  const requested = Math.min(50, Math.max(1, Math.floor(options.limit ?? 5)));
  const refreshAfterHours = Math.max(1, options.refreshAfterHours ?? 24);
  const rawCandidates = await getUniverseCandidates(Math.max(requested * 8, 100));
  const candidates = selectScannerCandidates(rawCandidates, {
    now: new Date().toISOString(),
    maxBatch: requested,
    refreshAfterHours,
  });
  const runId = await createRun(requested);

  if (!runId) {
    return { ok: false, runId: null, requested, candidates: candidates.length, analyzed: 0, predictions: 0, skipped: 0, failed: candidates.length, failures: [{ ticker: "*", reason: "scan_run_unavailable" }] };
  }

  let analyzed = 0;
  let predictions = 0;
  let skipped = 0;
  let failed = 0;
  const failures: AlphaUniverseScanResult["failures"] = [];
  const supabase = createAdminClient();

  if (!supabase) {
    await finishRun(runId, { candidates: candidates.length, analyzed, predictions, skipped, failed: candidates.length });
    return { ok: false, runId, requested, candidates: candidates.length, analyzed, predictions, skipped, failed: candidates.length, failures: [{ ticker: "*", reason: "supabase_unavailable" }] };
  }

  // Intentionally sequential: the existing provider layer has its own retries and external rate limits.
  // Scanner throughput is scaled by more cron invocations, not by uncontrolled provider concurrency.
  for (const universe of candidates) {
    try {
      const search = await searchCompanies(universe.ticker);
      const company = exactCompany(search, universe);
      if (!company) {
        skipped += 1;
        failures.push({ ticker: universe.ticker, reason: "identity_or_fundamentals_unavailable" });
        continue;
      }

      const analysis = await analyzeCompany({
        company,
        analysisType: "research",
        investmentProfile: "balanced",
      });
      if (!analysis.ok) {
        failed += 1;
        failures.push({ ticker: universe.ticker, reason: "analysis_unavailable" });
        continue;
      }
      analyzed += 1;

      const row = predictionRow(universe, runId, analysis.data);
      const write = await supabase.from("alpha_predictions").insert(row);
      if (write.error) {
        failed += 1;
        failures.push({ ticker: universe.ticker, reason: "prediction_persistence_failed" });
        continue;
      }
      predictions += 1;
    } catch {
      failed += 1;
      failures.push({ ticker: universe.ticker, reason: "scanner_exception" });
    }
  }

  await finishRun(runId, { candidates: candidates.length, analyzed, predictions, skipped, failed });
  return {
    ok: failed === 0,
    runId,
    requested,
    candidates: candidates.length,
    analyzed,
    predictions,
    skipped,
    failed,
    failures,
  };
}
