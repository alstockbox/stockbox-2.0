import {
  COVERAGE_DATA_STATUSES,
  type AnalysisArchetype,
  type CoverageDataStatus,
  type ScoreDimensionKey,
} from "@/lib/analysis";
import {
  coverageAudit,
  type CoverageAuditOptions,
  type CoverageAuditRunResult,
} from "./coverage-audit";

export type CoverageAuditBatchReportIssues = {
  noRating: number;
  lowCoverage: number;
  staleOrUnavailable: number;
  reconciliationWarnings: number;
  sourceConflicts: number;
  providerFailures: number;
  unknownCoverageReasons: number;
};

export type CoverageAuditMissingCluster = {
  metricId: string;
  category: ScoreDimensionKey;
  label: string;
  status: CoverageDataStatus;
  reason: string | null;
  count: number;
  exampleTickers: string[];
};

export type CoverageAuditBatchSummary = {
  total: number;
  successful: number;
  failed: number;
  resolutionFailures: number;
  analysisFailures: number;
  meanMetricCoverage: number | null;
  meanScoreCoverage: number | null;
  rootCauseCounts: Record<CoverageDataStatus, number>;
  topMissingMetrics: CoverageAuditMissingCluster[];
  reportIssues: CoverageAuditBatchReportIssues;
  markets: Record<string, number>;
  exchanges: Record<string, number>;
  archetypes: Partial<Record<AnalysisArchetype, number>>;
  failureReasons: Record<string, number>;
  providerFailures: Record<string, number>;
  coverageBuckets: {
    below50: number;
    from50To69: number;
    from70To89: number;
    atLeast90: number;
  };
};

export type CoverageAuditBatchResult = {
  inputCount: number;
  uniqueTickerCount: number;
  results: CoverageAuditRunResult[];
  summary: CoverageAuditBatchSummary;
};

export type CoverageAuditBatchOptions = Pick<CoverageAuditOptions, "analysisType" | "investmentProfile"> & {
  concurrency?: number;
  lowCoverageThreshold?: number;
  auditTicker?: (
    ticker: string,
    options?: Pick<CoverageAuditOptions, "analysisType" | "investmentProfile">,
  ) => Promise<CoverageAuditRunResult>;
};

export type CoverageAuditBatchCompleteEvent = {
  batchIndex: number;
  batchCount: number;
  tickers: string[];
  result: CoverageAuditBatchResult;
};

export type CoverageAuditLargeBatchOptions = CoverageAuditBatchOptions & {
  batchSize?: number;
  interBatchDelayMs?: number;
  retainResults?: boolean;
  onBatchComplete?: (event: CoverageAuditBatchCompleteEvent) => void | Promise<void>;
};

export type CoverageAuditLargeBatchResult = {
  inputCount: number;
  uniqueTickerCount: number;
  batchSize: number;
  processedBatchCount: number;
  results: CoverageAuditRunResult[];
  batchSummaries: CoverageAuditBatchSummary[];
  summary: CoverageAuditBatchSummary;
};

type SummaryAccumulator = {
  total: number;
  successful: number;
  failed: number;
  resolutionFailures: number;
  analysisFailures: number;
  metricCoverageSum: number;
  scoreCoverageSum: number;
  rootCauseCounts: Record<CoverageDataStatus, number>;
  reportIssues: CoverageAuditBatchReportIssues;
  markets: Record<string, number>;
  exchanges: Record<string, number>;
  archetypes: Partial<Record<AnalysisArchetype, number>>;
  failureReasons: Record<string, number>;
  providerFailures: Record<string, number>;
  coverageBuckets: CoverageAuditBatchSummary["coverageBuckets"];
  clusters: Map<string, CoverageAuditMissingCluster>;
};

function increment(target: Record<string, number>, key: string): void {
  target[key] = (target[key] ?? 0) + 1;
}

function normalizedTicker(value: string): string {
  return value.trim().toUpperCase();
}

function normalizedUniqueTickers(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const ticker = normalizedTicker(value);
    if (!ticker || seen.has(ticker)) continue;
    seen.add(ticker);
    result.push(ticker);
  }
  return result;
}

function emptyRootCauseCounts(): Record<CoverageDataStatus, number> {
  return Object.fromEntries(COVERAGE_DATA_STATUSES.map((status) => [status, 0])) as Record<CoverageDataStatus, number>;
}

function providerFailureKey(diagnostic: {
  provider: string;
  capability: string;
  reason?: string;
}): string {
  return `${diagnostic.provider}|${diagnostic.capability}|${diagnostic.reason ?? "unspecified"}`;
}

function missingClusterKey(input: {
  metricId: string;
  status: CoverageDataStatus;
  reason: string | null;
}): string {
  return `${input.metricId}|${input.status}|${input.reason ?? ""}`;
}

function createSummaryAccumulator(): SummaryAccumulator {
  return {
    total: 0,
    successful: 0,
    failed: 0,
    resolutionFailures: 0,
    analysisFailures: 0,
    metricCoverageSum: 0,
    scoreCoverageSum: 0,
    rootCauseCounts: emptyRootCauseCounts(),
    reportIssues: {
      noRating: 0,
      lowCoverage: 0,
      staleOrUnavailable: 0,
      reconciliationWarnings: 0,
      sourceConflicts: 0,
      providerFailures: 0,
      unknownCoverageReasons: 0,
    },
    markets: {},
    exchanges: {},
    archetypes: {},
    failureReasons: {},
    providerFailures: {},
    coverageBuckets: {
      below50: 0,
      from50To69: 0,
      from70To89: 0,
      atLeast90: 0,
    },
    clusters: new Map(),
  };
}

function accumulateCoverageAuditResult(
  accumulator: SummaryAccumulator,
  result: CoverageAuditRunResult,
  options: { lowCoverageThreshold: number; examplesPerCluster: number },
): void {
  accumulator.total += 1;

  if (!result.ok) {
    accumulator.failed += 1;
    if (result.stage === "resolution") accumulator.resolutionFailures += 1;
    else accumulator.analysisFailures += 1;
    increment(accumulator.failureReasons, `${result.stage}:${result.reason}`);
    for (const diagnostic of result.providerDiagnostics) {
      if (diagnostic.status === "unavailable") {
        increment(accumulator.providerFailures, providerFailureKey(diagnostic));
      }
    }
    return;
  }

  accumulator.successful += 1;
  accumulator.metricCoverageSum += result.audit.metricCoverage;
  accumulator.scoreCoverageSum += result.audit.scoreCoverage;
  increment(accumulator.markets, result.country ?? "unknown");
  increment(accumulator.exchanges, result.exchange ?? "unknown");
  accumulator.archetypes[result.audit.archetype] = (accumulator.archetypes[result.audit.archetype] ?? 0) + 1;

  for (const status of COVERAGE_DATA_STATUSES) {
    accumulator.rootCauseCounts[status] += result.audit.rootCauseCounts[status] ?? 0;
  }

  for (const metric of result.audit.metrics) {
    if (!metric.relevant || metric.available || metric.status === "NOT_APPLICABLE") continue;
    const key = missingClusterKey({ metricId: metric.id, status: metric.status, reason: metric.reason });
    const existing = accumulator.clusters.get(key);
    if (existing) {
      existing.count += 1;
      if (
        existing.exampleTickers.length < options.examplesPerCluster
        && !existing.exampleTickers.includes(result.resolvedTicker)
      ) {
        existing.exampleTickers.push(result.resolvedTicker);
      }
    } else {
      accumulator.clusters.set(key, {
        metricId: metric.id,
        category: metric.category,
        label: metric.label,
        status: metric.status,
        reason: metric.reason,
        count: 1,
        exampleTickers: [result.resolvedTicker],
      });
    }
  }

  if (result.report.recommendation === "No Rating") accumulator.reportIssues.noRating += 1;
  if ((result.report.dataCoverage ?? result.audit.scoreCoverage) < options.lowCoverageThreshold) {
    accumulator.reportIssues.lowCoverage += 1;
  }
  if (result.report.dataStatus === "stale" || result.report.dataStatus === "unavailable") {
    accumulator.reportIssues.staleOrUnavailable += 1;
  }
  if (result.report.reconciliationWarningCount > 0) accumulator.reportIssues.reconciliationWarnings += 1;
  if (result.report.sourceConflictCount > 0) accumulator.reportIssues.sourceConflicts += 1;
  if (result.report.providerFailureCount > 0) accumulator.reportIssues.providerFailures += 1;
  if (result.audit.unknownMetricCount > 0) accumulator.reportIssues.unknownCoverageReasons += 1;

  for (const diagnostic of result.providerDiagnostics) {
    if (diagnostic.status === "unavailable") {
      increment(accumulator.providerFailures, providerFailureKey(diagnostic));
    }
  }

  const coverage = result.audit.metricCoverage;
  if (coverage < 0.5) accumulator.coverageBuckets.below50 += 1;
  else if (coverage < 0.7) accumulator.coverageBuckets.from50To69 += 1;
  else if (coverage < 0.9) accumulator.coverageBuckets.from70To89 += 1;
  else accumulator.coverageBuckets.atLeast90 += 1;
}

function finalizeSummary(
  accumulator: SummaryAccumulator,
  topMissingLimit: number,
): CoverageAuditBatchSummary {
  const topMissingMetrics = [...accumulator.clusters.values()]
    .sort((left, right) => right.count - left.count
      || left.metricId.localeCompare(right.metricId)
      || left.status.localeCompare(right.status))
    .slice(0, topMissingLimit);

  return {
    total: accumulator.total,
    successful: accumulator.successful,
    failed: accumulator.failed,
    resolutionFailures: accumulator.resolutionFailures,
    analysisFailures: accumulator.analysisFailures,
    meanMetricCoverage: accumulator.successful
      ? accumulator.metricCoverageSum / accumulator.successful
      : null,
    meanScoreCoverage: accumulator.successful
      ? accumulator.scoreCoverageSum / accumulator.successful
      : null,
    rootCauseCounts: accumulator.rootCauseCounts,
    topMissingMetrics,
    reportIssues: accumulator.reportIssues,
    markets: accumulator.markets,
    exchanges: accumulator.exchanges,
    archetypes: accumulator.archetypes,
    failureReasons: accumulator.failureReasons,
    providerFailures: accumulator.providerFailures,
    coverageBuckets: accumulator.coverageBuckets,
  };
}

export function summarizeCoverageAuditBatch(
  results: CoverageAuditRunResult[],
  options: { lowCoverageThreshold?: number; topMissingLimit?: number; examplesPerCluster?: number } = {},
): CoverageAuditBatchSummary {
  const lowCoverageThreshold = options.lowCoverageThreshold ?? 0.5;
  const topMissingLimit = Math.max(1, Math.min(500, Math.floor(options.topMissingLimit ?? 30)));
  const examplesPerCluster = Math.max(1, Math.min(25, Math.floor(options.examplesPerCluster ?? 10)));
  const accumulator = createSummaryAccumulator();
  for (const result of results) {
    accumulateCoverageAuditResult(accumulator, result, { lowCoverageThreshold, examplesPerCluster });
  }
  return finalizeSummary(accumulator, topMissingLimit);
}

function auditExceptionFailure(ticker: string): CoverageAuditRunResult {
  return {
    ok: false,
    requestedTicker: ticker,
    stage: "analysis",
    reason: "audit_exception",
    providerDiagnostics: [],
    warnings: [],
  };
}

export async function runCoverageAuditBatch(
  tickerValues: string[],
  options: CoverageAuditBatchOptions = {},
): Promise<CoverageAuditBatchResult> {
  const tickers = normalizedUniqueTickers(tickerValues);
  const requestedConcurrency = Math.floor(options.concurrency ?? 4);
  const concurrency = Math.max(1, Math.min(12, Number.isFinite(requestedConcurrency) ? requestedConcurrency : 4));
  const auditTicker = options.auditTicker ?? coverageAudit;
  const results = new Array<CoverageAuditRunResult>(tickers.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= tickers.length) return;
      const ticker = tickers[index];
      try {
        results[index] = await auditTicker(ticker, {
          analysisType: options.analysisType,
          investmentProfile: options.investmentProfile,
        });
      } catch {
        results[index] = auditExceptionFailure(ticker);
      }
    }
  }

  const workerCount = Math.min(concurrency, tickers.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return {
    inputCount: tickerValues.length,
    uniqueTickerCount: tickers.length,
    results,
    summary: summarizeCoverageAuditBatch(results, {
      lowCoverageThreshold: options.lowCoverageThreshold,
    }),
  };
}

function sleep(ms: number): Promise<void> {
  return ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runCoverageAuditBatches(
  tickerValues: string[],
  options: CoverageAuditLargeBatchOptions = {},
): Promise<CoverageAuditLargeBatchResult> {
  const tickers = normalizedUniqueTickers(tickerValues);
  const requestedBatchSize = Math.floor(options.batchSize ?? 100);
  const batchSize = Math.max(1, Math.min(1000, Number.isFinite(requestedBatchSize) ? requestedBatchSize : 100));
  const requestedDelay = Math.floor(options.interBatchDelayMs ?? 250);
  const interBatchDelayMs = Math.max(0, Math.min(60_000, Number.isFinite(requestedDelay) ? requestedDelay : 250));
  const retainResults = options.retainResults ?? false;
  const lowCoverageThreshold = options.lowCoverageThreshold ?? 0.5;
  const batchCount = Math.ceil(tickers.length / batchSize);
  const retainedResults: CoverageAuditRunResult[] = [];
  const batchSummaries: CoverageAuditBatchSummary[] = [];
  const accumulator = createSummaryAccumulator();

  for (let batchIndex = 0; batchIndex < batchCount; batchIndex += 1) {
    const start = batchIndex * batchSize;
    const batchTickers = tickers.slice(start, start + batchSize);
    const batch = await runCoverageAuditBatch(batchTickers, {
      analysisType: options.analysisType,
      investmentProfile: options.investmentProfile,
      concurrency: options.concurrency,
      lowCoverageThreshold,
      auditTicker: options.auditTicker,
    });

    for (const result of batch.results) {
      accumulateCoverageAuditResult(accumulator, result, {
        lowCoverageThreshold,
        examplesPerCluster: 10,
      });
    }

    batchSummaries.push(batch.summary);
    if (retainResults) retainedResults.push(...batch.results);

    await options.onBatchComplete?.({
      batchIndex,
      batchCount,
      tickers: batchTickers,
      result: batch,
    });

    if (batchIndex < batchCount - 1) await sleep(interBatchDelayMs);
  }

  return {
    inputCount: tickerValues.length,
    uniqueTickerCount: tickers.length,
    batchSize,
    processedBatchCount: batchCount,
    results: retainedResults,
    batchSummaries,
    summary: finalizeSummary(accumulator, 100),
  };
}
