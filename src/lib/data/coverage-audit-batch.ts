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

function increment(target: Record<string, number>, key: string): void {
  target[key] = (target[key] ?? 0) + 1;
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
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

export function summarizeCoverageAuditBatch(
  results: CoverageAuditRunResult[],
  options: { lowCoverageThreshold?: number; topMissingLimit?: number; examplesPerCluster?: number } = {},
): CoverageAuditBatchSummary {
  const lowCoverageThreshold = options.lowCoverageThreshold ?? 0.5;
  const topMissingLimit = Math.max(1, Math.min(100, Math.floor(options.topMissingLimit ?? 30)));
  const examplesPerCluster = Math.max(1, Math.min(25, Math.floor(options.examplesPerCluster ?? 10)));
  const successes = results.filter((item): item is Extract<CoverageAuditRunResult, { ok: true }> => item.ok);
  const failures = results.filter((item): item is Extract<CoverageAuditRunResult, { ok: false }> => !item.ok);
  const rootCauseCounts = emptyRootCauseCounts();
  const markets: Record<string, number> = {};
  const exchanges: Record<string, number> = {};
  const archetypes: Partial<Record<AnalysisArchetype, number>> = {};
  const failureReasons: Record<string, number> = {};
  const providerFailures: Record<string, number> = {};
  const clusters = new Map<string, CoverageAuditMissingCluster>();
  const reportIssues: CoverageAuditBatchReportIssues = {
    noRating: 0,
    lowCoverage: 0,
    staleOrUnavailable: 0,
    reconciliationWarnings: 0,
    sourceConflicts: 0,
    providerFailures: 0,
    unknownCoverageReasons: 0,
  };
  const coverageBuckets = {
    below50: 0,
    from50To69: 0,
    from70To89: 0,
    atLeast90: 0,
  };

  for (const failure of failures) {
    increment(failureReasons, `${failure.stage}:${failure.reason}`);
    for (const diagnostic of failure.providerDiagnostics) {
      if (diagnostic.status === "unavailable") increment(providerFailures, providerFailureKey(diagnostic));
    }
  }

  for (const result of successes) {
    increment(markets, result.country ?? "unknown");
    increment(exchanges, result.exchange ?? "unknown");
    archetypes[result.audit.archetype] = (archetypes[result.audit.archetype] ?? 0) + 1;

    for (const status of COVERAGE_DATA_STATUSES) {
      rootCauseCounts[status] += result.audit.rootCauseCounts[status] ?? 0;
    }

    for (const metric of result.audit.metrics) {
      if (!metric.relevant || metric.available || metric.status === "NOT_APPLICABLE") continue;
      const key = missingClusterKey({ metricId: metric.id, status: metric.status, reason: metric.reason });
      const existing = clusters.get(key);
      if (existing) {
        existing.count += 1;
        if (existing.exampleTickers.length < examplesPerCluster && !existing.exampleTickers.includes(result.resolvedTicker)) {
          existing.exampleTickers.push(result.resolvedTicker);
        }
      } else {
        clusters.set(key, {
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

    if (result.report.recommendation === "No Rating") reportIssues.noRating += 1;
    if ((result.report.dataCoverage ?? result.audit.scoreCoverage) < lowCoverageThreshold) reportIssues.lowCoverage += 1;
    if (result.report.dataStatus === "stale" || result.report.dataStatus === "unavailable") reportIssues.staleOrUnavailable += 1;
    if (result.report.reconciliationWarningCount > 0) reportIssues.reconciliationWarnings += 1;
    if (result.report.sourceConflictCount > 0) reportIssues.sourceConflicts += 1;
    if (result.report.providerFailureCount > 0) reportIssues.providerFailures += 1;
    if (result.audit.unknownMetricCount > 0) reportIssues.unknownCoverageReasons += 1;

    for (const diagnostic of result.providerDiagnostics) {
      if (diagnostic.status === "unavailable") increment(providerFailures, providerFailureKey(diagnostic));
    }

    const coverage = result.audit.metricCoverage;
    if (coverage < 0.5) coverageBuckets.below50 += 1;
    else if (coverage < 0.7) coverageBuckets.from50To69 += 1;
    else if (coverage < 0.9) coverageBuckets.from70To89 += 1;
    else coverageBuckets.atLeast90 += 1;
  }

  const topMissingMetrics = [...clusters.values()]
    .sort((left, right) => right.count - left.count
      || left.metricId.localeCompare(right.metricId)
      || left.status.localeCompare(right.status))
    .slice(0, topMissingLimit);

  return {
    total: results.length,
    successful: successes.length,
    failed: failures.length,
    resolutionFailures: failures.filter((item) => item.stage === "resolution").length,
    analysisFailures: failures.filter((item) => item.stage === "analysis").length,
    meanMetricCoverage: mean(successes.map((item) => item.audit.metricCoverage)),
    meanScoreCoverage: mean(successes.map((item) => item.audit.scoreCoverage)),
    rootCauseCounts,
    topMissingMetrics,
    reportIssues,
    markets,
    exchanges,
    archetypes,
    failureReasons,
    providerFailures,
    coverageBuckets,
  };
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
