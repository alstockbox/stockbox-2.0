import type { AnalysisReport, BatchQaResult, FinancialAnalysisInput, QaFlag } from "./types";
import { SCORE_COVERAGE_POLICY } from "./config";
import { summarizeSourceConflicts } from "./source-conflicts";
import { economicCurrencyCode } from "./currency-units";

type HistoricalCurrencyState = "aligned" | "mismatch" | "unknown" | "not_applicable";

type CurrencyAwareHistoricalPoint = {
  currency?: string | null;
};

function historicalPriceCurrencyState(report: AnalysisReport): HistoricalCurrencyState {
  const history = report.historical?.price ?? [];
  if (!history.length) return "not_applicable";

  const marketCurrency = economicCurrencyCode(report.market?.currency);
  if (!marketCurrency) return "unknown";

  let hasUnknown = false;
  const observedCurrencies = new Set<string>();
  for (const point of history) {
    const currency = economicCurrencyCode((point as CurrencyAwareHistoricalPoint).currency);
    if (!currency) {
      hasUnknown = true;
      continue;
    }
    observedCurrencies.add(currency);
  }

  if (observedCurrencies.size > 1) return "mismatch";
  const observed = [...observedCurrencies][0];
  if (observed && observed !== marketCurrency) return "mismatch";
  if (hasUnknown || !observed) return "unknown";
  return "aligned";
}

function applyHistoricalCurrencyQa(report: AnalysisReport): HistoricalCurrencyState {
  const state = historicalPriceCurrencyState(report);
  if (state === "not_applicable" || state === "aligned") return state;

  const ceiling = state === "mismatch" ? 0 : 25;
  if (report.confidenceBreakdown) {
    report.confidenceBreakdown.currencyAlignment = Math.min(
      report.confidenceBreakdown.currencyAlignment,
      ceiling,
    );
  }
  if (report.engine?.scores.confidenceBreakdown) {
    report.engine.scores.confidenceBreakdown.currencyAlignment = Math.min(
      report.engine.scores.confidenceBreakdown.currencyAlignment,
      ceiling,
    );
  }
  if (report.engine?.confidenceBreakdown) {
    report.engine.confidenceBreakdown.currencyAlignment = Math.min(
      report.engine.confidenceBreakdown.currencyAlignment,
      ceiling,
    );
  }
  return state;
}

export function buildBatchQaResult(input: {
  batchId: string;
  rerunKey: string;
  report: AnalysisReport;
  analysisInput: FinancialAnalysisInput;
  providerVersions?: Record<string, string>;
  expectedEntityId?: string;
  expectedArchetype?: AnalysisReport["analysisArchetype"];
  sourceConflicts?: string[];
}): BatchQaResult {
  const { report, analysisInput } = input;
  const engine = report.engine;
  if (!engine) throw new Error("Batch QA requires the canonical engine result.");
  const sourceConflictPolicy = summarizeSourceConflicts({
    ...analysisInput,
    sourceConflicts: engine.sourceConflicts.length ? engine.sourceConflicts : analysisInput.sourceConflicts,
  });
  const flags = new Set<QaFlag>();
  const historicalCurrency = applyHistoricalCurrencyQa(report);
  if (report.dataStatus === "stale") flags.add("STALE_DATA");
  if ((report.dataCoverage ?? 0) < SCORE_COVERAGE_POLICY.overallMinimum) flags.add("LOW_COVERAGE");
  if (input.expectedEntityId && analysisInput.company.entityId !== input.expectedEntityId) flags.add("ENTITY_MISMATCH");
  if (input.expectedArchetype && report.analysisArchetype !== input.expectedArchetype) flags.add("WRONG_ARCHETYPE");
  if (!analysisInput.company.currency && !analysisInput.market?.currency) flags.add("UNSUPPORTED_MARKET");
  if (engine.diagnostics.ttmStatus === "annual_fallback") flags.add("TTM_FALLBACK");
  if (engine.reconciliation.some((check) => check.code.includes("period") && check.status === "warning")) flags.add("PERIOD_MISMATCH");
  if (
    historicalCurrency === "mismatch"
    || engine.reconciliation.some((check) => check.code.includes("currency") && check.status === "warning")
  ) flags.add("CURRENCY_MISMATCH");
  if (engine.reconciliation.some((check) => check.status === "warning")) flags.add("RECONCILIATION_FAIL");
  const diagnostics = report.providerDiagnostics ?? [];
  const coreCapabilities = ["fundamentals", "market_data"] as const;
  const fallbackUsed = coreCapabilities.some((capability) => {
    const attempts = diagnostics.filter((item) => item.capability === capability);
    return attempts.some((item) => item.status === "unavailable")
      && attempts.some((item) => item.status === "available" || item.status === "partial");
  });
  if (fallbackUsed) flags.add("FALLBACK_USED");
  const finalMarketAvailable = Boolean(analysisInput.market && typeof analysisInput.market.price === "number" && Number.isFinite(analysisInput.market.price));
  if (!finalMarketAvailable && diagnostics.some((item) => item.capability === "market_data" && item.status === "unavailable")) {
    flags.add("MARKET_PROVIDER_ERROR");
  }
  if (["bank", "insurer", "reit"].includes(report.analysisArchetype ?? "") && (engine.scores.specializedCoverage?.overall ?? 0) < 0.7) {
    flags.add("SPECIALIZED_DATA_MISSING");
  }
  const specializedValuation = engine.dcf.status === "inappropriate"
    && ["bank", "insurer", "reit"].includes(engine.analysisArchetype)
    && (engine.scores.specializedCoverage?.overall ?? 0) >= 0.7
    && (engine.scores.dimensions.valuation.coverage ?? 0) >= SCORE_COVERAGE_POLICY.dimensionFull
    && typeof engine.scores.dimensions.valuation.score === "number"
    && Number.isFinite(engine.scores.dimensions.valuation.score);
  if (engine.dcf.status !== "available" && !specializedValuation) flags.add("VALUATION_UNAVAILABLE");
  if (report.scenarioStatus === "insufficient_data") flags.add("SCENARIO_UNSUPPORTED");
  if (input.sourceConflicts?.length || sourceConflictPolicy.hasConflicts) flags.add("SOURCE_CONFLICT");
  if (engine.dataStatus === "unavailable") flags.add("DATA_UNAVAILABLE");
  if (engine.missingData.some((item) => item.field === "futureFinancialData")) flags.add("FUTURE_DATA");
  if (engine.classificationDiagnostics?.ambiguous || (engine.classificationDiagnostics?.confidence ?? 1) < 0.6) flags.add("ARCHETYPE_UNCERTAIN");
  const sourceProviderVersions = Object.fromEntries(
    report.sources.flatMap((source) => source.provider && source.version
      ? [[source.provider, source.version] as const]
      : []),
  );
  return {
    batchId: input.batchId,
    rerunKey: input.rerunKey,
    modelVersion: engine.modelVersion,
    scorePolicyVersion: engine.scores.methodology.scorePolicyVersion,
    benchmarkVersion: engine.scores.methodology.benchmarkVersion,
    canonicalInputFingerprint: engine.canonicalInputFingerprint,
    providerVersions: { ...sourceProviderVersions, ...(input.providerVersions ?? {}) },
    analysisTimestamp: report.generatedAt,
    canonicalEntity: analysisInput.company.entityId ?? `listing:${report.ticker}`,
    archetype: engine.analysisArchetype,
    coverage: engine.dataCoverage,
    confidence: engine.scores.confidence,
    score: engine.scores.stockBoxScore,
    rating: engine.recommendation.rating,
    flags: [...flags],
  };
}

export function summarizeBatchQaResults(results: BatchQaResult[]) {
  const scores = results.map((item) => item.score).filter((value): value is number => typeof value === "number" && Number.isFinite(value)).sort((a, b) => a - b);
  const meanScore = scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null;
  const medianScore = scores.length
    ? scores.length % 2 === 1
      ? scores[Math.floor(scores.length / 2)]
      : (scores[scores.length / 2 - 1] + scores[scores.length / 2]) / 2
    : null;
  const scoreBands = { "0-39": 0, "40-59": 0, "60-79": 0, "80-100": 0 };
  for (const score of scores) {
    if (score < 40) scoreBands["0-39"] += 1;
    else if (score < 60) scoreBands["40-59"] += 1;
    else if (score < 80) scoreBands["60-79"] += 1;
    else scoreBands["80-100"] += 1;
  }
  const flagCounts: Partial<Record<QaFlag, number>> = {};
  for (const result of results) for (const flag of result.flags) flagCounts[flag] = (flagCounts[flag] ?? 0) + 1;
  const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const quantile = (position: number) => {
    if (!scores.length) return null;
    const index = (scores.length - 1) * position;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return scores[lower];
    return scores[lower] + (scores[upper] - scores[lower]) * (index - lower);
  };
  const standardDeviation = scores.length && meanScore !== null
    ? Math.sqrt(scores.reduce((sum, value) => sum + (value - meanScore) ** 2, 0) / scores.length)
    : null;
  return {
    total: results.length,
    scored: scores.length,
    meanScore,
    medianScore,
    scoreBands,
    meanCoverage: average(results.map((item) => item.coverage)),
    meanConfidence: average(results.map((item) => item.confidence)),
    noRatingCount: results.filter((item) => item.rating === 'No Rating').length,
    noRatingRate: results.length ? results.filter((item) => item.rating === 'No Rating').length / results.length : 0,
    p10: quantile(0.1),
    p25: quantile(0.25),
    p75: quantile(0.75),
    p90: quantile(0.9),
    standardDeviation,
    flagCounts,
  };
}


export function compareBatchQaRuns(previous: BatchQaResult[], current: BatchQaResult[]) {
  const previousByEntity = new Map(previous.map((item) => [item.canonicalEntity, item]));
  const currentByEntity = new Map(current.map((item) => [item.canonicalEntity, item]));
  const matchedEntities = [...previousByEntity.keys()].filter((entity) => currentByEntity.has(entity)).sort();
  const addedEntities = [...currentByEntity.keys()].filter((entity) => !previousByEntity.has(entity)).sort();
  const removedEntities = [...previousByEntity.keys()].filter((entity) => !currentByEntity.has(entity)).sort();
  const pairs = matchedEntities.map((entity) => [previousByEntity.get(entity)!, currentByEntity.get(entity)!] as const);
  const scoreDeltas = pairs.flatMap(([before, after]) =>
    typeof before.score === "number" && Number.isFinite(before.score)
      && typeof after.score === "number" && Number.isFinite(after.score)
      ? [{ canonicalEntity: before.canonicalEntity, from: before.score, to: after.score, delta: after.score - before.score }]
      : []);
  const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const ratingChanges = pairs.flatMap(([before, after]) => before.rating === after.rating ? [] : [{
    canonicalEntity: before.canonicalEntity, from: before.rating, to: after.rating,
  }]);
  const flagChanges = pairs.flatMap(([before, after]) => {
    const added = after.flags.filter((flag) => !before.flags.includes(flag));
    const removed = before.flags.filter((flag) => !after.flags.includes(flag));
    return added.length || removed.length ? [{ canonicalEntity: before.canonicalEntity, added, removed }] : [];
  });
  const scoreAvailabilityChanges = pairs.flatMap(([before, after]) => {
    const beforeAvailable = typeof before.score === "number" && Number.isFinite(before.score);
    const afterAvailable = typeof after.score === "number" && Number.isFinite(after.score);
    return beforeAvailable === afterAvailable ? [] : [{ canonicalEntity: before.canonicalEntity, from: beforeAvailable, to: afterAvailable }];
  });
  const noRatingTransitions = pairs.flatMap(([before, after]) => {
    const beforeNoRating = before.rating === "No Rating";
    const afterNoRating = after.rating === "No Rating";
    return beforeNoRating === afterNoRating ? [] : [{ canonicalEntity: before.canonicalEntity, from: beforeNoRating, to: afterNoRating }];
  });
  const archetypeChanges = pairs.flatMap(([before, after]) => before.archetype === after.archetype ? [] : [{
    canonicalEntity: before.canonicalEntity,
    from: before.archetype,
    to: after.archetype,
  }]);
  const perEntityDeltas = pairs.map(([before, after]) => ({
    canonicalEntity: before.canonicalEntity,
    coverageDelta: after.coverage - before.coverage,
    confidenceDelta: after.confidence - before.confidence,
  }));
  return {
    matched: pairs.length, addedEntities, removedEntities, ratingChanges,
    scoreDeltas,
    scoreAvailabilityChanges,
    noRatingTransitions,
    archetypeChanges,
    perEntityDeltas,
    meanSignedScoreDelta: average(scoreDeltas.map((item) => item.delta)),
    meanAbsoluteScoreDelta: average(scoreDeltas.map((item) => Math.abs(item.delta))),
    maxAbsoluteScoreDelta: scoreDeltas.length ? Math.max(...scoreDeltas.map((item) => Math.abs(item.delta))) : null,
    meanCoverageDelta: average(pairs.map(([before, after]) => after.coverage - before.coverage)),
    meanConfidenceDelta: average(pairs.map(([before, after]) => after.confidence - before.confidence)),
    flagChanges,
  };
}
