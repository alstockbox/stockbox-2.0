import { describe, expect, it, vi } from "vitest";
import type { CoverageAuditRunResult } from "../../src/lib/data/coverage-audit";
import { runCoverageAuditBatches } from "../../src/lib/data/coverage-audit-batch";

function success(ticker: string): Extract<CoverageAuditRunResult, { ok: true }> {
  return {
    ok: true,
    requestedTicker: ticker,
    resolvedTicker: ticker,
    companyName: ticker,
    entityId: `listing:${ticker}`,
    country: "US",
    exchange: "NASDAQ",
    currency: "USD",
    audit: {
      ticker,
      archetype: "standard",
      metricCoverage: 0.8,
      scoreCoverage: 0.75,
      relevantMetricCount: 2,
      availableMetricCount: 1,
      missingMetricCount: 1,
      notApplicableMetricCount: 0,
      unknownMetricCount: 0,
      categories: {} as Extract<CoverageAuditRunResult, { ok: true }>["audit"]["categories"],
      metrics: [
        {
          id: "valuation:P / E",
          category: "valuation",
          label: "P / E",
          status: "PROVIDER_MISSING",
          relevant: true,
          available: false,
          value: null,
          weight: 1,
          reason: "Provider did not return market cap.",
          source: null,
          period: null,
          providerDiagnostics: [],
        },
      ],
      rootCauseCounts: {
        AVAILABLE: 0,
        DERIVED: 0,
        NOT_APPLICABLE: 0,
        PROVIDER_MISSING: 1,
        PROVIDER_ERROR: 0,
        TIMEOUT: 0,
        RATE_LIMITED: 0,
        MAPPING_ERROR: 0,
        PARSING_ERROR: 0,
        NORMALIZATION_ERROR: 0,
        CALCULATION_FAILED: 0,
        INVALID: 0,
        STALE: 0,
        INSUFFICIENT_HISTORY: 0,
        CURRENCY_ERROR: 0,
        PERIOD_ERROR: 0,
        UNKNOWN: 0,
      },
      providerDiagnostics: [],
    },
    report: {
      id: `analysis-${ticker}`,
      ticker,
      generatedAt: "2026-09-04T00:00:00.000Z",
      analysisType: "numbers",
      investmentProfile: "balanced",
      dataCoverage: 0.75,
      dataStatus: "current",
      recommendation: "Hold",
      score: 60,
      personalizedScore: 60,
      confidence: 75,
      scenarioStatus: "valuation",
      enginePresent: true,
      sourceCount: 2,
      warningCount: 0,
      missingDataCount: 1,
      reconciliationWarningCount: 0,
      sourceConflictCount: 0,
      providerFailureCount: 0,
      historicalCoverage: null,
    },
    providerDiagnostics: [],
  };
}

describe("large coverage audit orchestration", () => {
  it("processes globally deduplicated tickers in bounded chunks without retaining full audits", async () => {
    const auditTicker = vi.fn(async (ticker: string): Promise<CoverageAuditRunResult> => {
      if (ticker === "BROKEN") {
        return {
          ok: false,
          requestedTicker: ticker,
          stage: "analysis",
          reason: "provider_failure",
          providerDiagnostics: [],
          warnings: [],
        };
      }
      return success(ticker);
    });
    const onBatchComplete = vi.fn();

    const result = await runCoverageAuditBatches(
      ["AAPL", "MSFT", " aapl ", "NVDA", "BROKEN", "", "ERIC-B.ST"],
      {
        batchSize: 2,
        concurrency: 2,
        interBatchDelayMs: 0,
        retainResults: false,
        auditTicker,
        onBatchComplete,
      },
    );

    expect(result.inputCount).toBe(7);
    expect(result.uniqueTickerCount).toBe(5);
    expect(result.processedBatchCount).toBe(3);
    expect(result.results).toEqual([]);
    expect(result.batchSummaries).toHaveLength(3);
    expect(onBatchComplete).toHaveBeenCalledTimes(3);
    expect(onBatchComplete.mock.calls.map(([event]) => event.tickers.length)).toEqual([2, 2, 1]);
    expect(auditTicker).toHaveBeenCalledTimes(5);
    expect(result.summary.total).toBe(5);
    expect(result.summary.successful).toBe(4);
    expect(result.summary.failed).toBe(1);
    expect(result.summary.analysisFailures).toBe(1);
    expect(result.summary.rootCauseCounts.PROVIDER_MISSING).toBe(4);
    expect(result.summary.topMissingMetrics[0]).toMatchObject({
      metricId: "valuation:P / E",
      count: 4,
    });
    expect(result.summary.topMissingMetrics[0].exampleTickers).toEqual(["AAPL", "MSFT", "NVDA", "ERIC-B.ST"]);
  });

  it("can retain full per-ticker audits for small diagnostic runs", async () => {
    const auditTicker = vi.fn(async (ticker: string) => success(ticker));
    const result = await runCoverageAuditBatches(["AAPL", "MSFT", "NVDA"], {
      batchSize: 2,
      concurrency: 1,
      interBatchDelayMs: 0,
      retainResults: true,
      auditTicker,
    });

    expect(result.results.map((item) => item.requestedTicker)).toEqual(["AAPL", "MSFT", "NVDA"]);
    expect(result.summary.successful).toBe(3);
  });
});
