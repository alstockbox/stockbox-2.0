import { describe, expect, it, vi } from "vitest";
import type { CoverageAuditRunResult } from "../../src/lib/data/coverage-audit";
import {
  runCoverageAuditBatch,
  summarizeCoverageAuditBatch,
} from "../../src/lib/data/coverage-audit-batch";

function success(ticker: string, overrides: Partial<Extract<CoverageAuditRunResult, { ok: true }>> = {}): Extract<CoverageAuditRunResult, { ok: true }> {
  return {
    ok: true,
    requestedTicker: ticker,
    resolvedTicker: ticker,
    companyName: ticker,
    entityId: `listing:${ticker}`,
    country: ticker === "ERIC-B.ST" ? "SE" : "US",
    exchange: ticker === "ERIC-B.ST" ? "Stockholm" : "NASDAQ",
    currency: ticker === "ERIC-B.ST" ? "SEK" : "USD",
    audit: {
      ticker,
      archetype: "standard",
      metricCoverage: 0.8,
      scoreCoverage: 0.75,
      relevantMetricCount: 10,
      availableMetricCount: 8,
      missingMetricCount: 2,
      notApplicableMetricCount: 1,
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
          weight: 0.5,
          reason: "Provider did not return market cap.",
          source: null,
          period: null,
          providerDiagnostics: [],
        },
        {
          id: "growth:Revenue growth",
          category: "growth",
          label: "Revenue growth",
          status: "AVAILABLE",
          relevant: true,
          available: true,
          value: 0.12,
          weight: 0.5,
          reason: null,
          source: "fixture",
          period: "2026",
          providerDiagnostics: [],
        },
      ],
      rootCauseCounts: {
        AVAILABLE: 1,
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
      score: 61,
      personalizedScore: 60,
      confidence: 78,
      scenarioStatus: "valuation",
      enginePresent: true,
      sourceCount: 2,
      warningCount: 0,
      missingDataCount: 2,
      reconciliationWarningCount: 0,
      sourceConflictCount: 0,
      providerFailureCount: 0,
      historicalCoverage: null,
    },
    providerDiagnostics: [],
    ...overrides,
  };
}

function failure(ticker: string, reason = "ambiguous"): Extract<CoverageAuditRunResult, { ok: false }> {
  return {
    ok: false,
    requestedTicker: ticker,
    stage: "resolution",
    reason,
    candidateCount: 2,
    providerDiagnostics: [],
    warnings: [],
  };
}

describe("coverage audit batch summary", () => {
  it("clusters systemic missing metrics, root causes, report problems, markets and failures", () => {
    const aapl = success("AAPL");
    const msft = success("MSFT", {
      report: {
        ...success("MSFT").report,
        recommendation: "No Rating",
        dataCoverage: 0.42,
        dataStatus: "stale",
        reconciliationWarningCount: 2,
        sourceConflictCount: 1,
        providerFailureCount: 1,
      },
      providerDiagnostics: [{
        provider: "Yahoo Finance chart",
        capability: "market_data",
        status: "unavailable",
        reason: "rate_limited",
        observedAt: "2026-09-04T00:00:00.000Z",
      }],
    });
    const eric = success("ERIC-B.ST", {
      audit: {
        ...success("ERIC-B.ST").audit,
        archetype: "software_growth",
        metricCoverage: 0.6,
        scoreCoverage: 0.55,
      },
    });

    const summary = summarizeCoverageAuditBatch([aapl, msft, eric, failure("META", "ambiguous")]);

    expect(summary.total).toBe(4);
    expect(summary.successful).toBe(3);
    expect(summary.failed).toBe(1);
    expect(summary.resolutionFailures).toBe(1);
    expect(summary.analysisFailures).toBe(0);
    expect(summary.meanMetricCoverage).toBeCloseTo((0.8 + 0.8 + 0.6) / 3, 10);
    expect(summary.meanScoreCoverage).toBeCloseTo((0.75 + 0.75 + 0.55) / 3, 10);
    expect(summary.rootCauseCounts.PROVIDER_MISSING).toBe(3);
    expect(summary.topMissingMetrics[0]).toMatchObject({
      metricId: "valuation:P / E",
      status: "PROVIDER_MISSING",
      count: 3,
    });
    expect(summary.topMissingMetrics[0].exampleTickers).toEqual(["AAPL", "MSFT", "ERIC-B.ST"]);
    expect(summary.reportIssues.noRating).toBe(1);
    expect(summary.reportIssues.lowCoverage).toBe(1);
    expect(summary.reportIssues.staleOrUnavailable).toBe(1);
    expect(summary.reportIssues.reconciliationWarnings).toBe(1);
    expect(summary.reportIssues.sourceConflicts).toBe(1);
    expect(summary.reportIssues.providerFailures).toBe(1);
    expect(summary.markets.US).toBe(2);
    expect(summary.markets.SE).toBe(1);
    expect(summary.archetypes.standard).toBe(2);
    expect(summary.archetypes.software_growth).toBe(1);
    expect(summary.failureReasons["resolution:ambiguous"]).toBe(1);
    expect(summary.providerFailures["Yahoo Finance chart|market_data|rate_limited"]).toBe(1);
  });
});

describe("coverage audit batch runner", () => {
  it("normalizes and deduplicates tickers, bounds concurrency and converts thrown audits into per-ticker failures", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const auditTicker = vi.fn(async (ticker: string): Promise<CoverageAuditRunResult> => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      if (ticker === "BROKEN") throw new Error("unexpected provider exception");
      return success(ticker);
    });

    const batch = await runCoverageAuditBatch(
      [" aapl ", "MSFT", "aapl", "broken", "", "ERIC-B.ST"],
      { concurrency: 2, auditTicker },
    );

    expect(auditTicker).toHaveBeenCalledTimes(4);
    expect(auditTicker.mock.calls.map(([ticker]) => ticker)).toEqual(expect.arrayContaining(["AAPL", "MSFT", "BROKEN", "ERIC-B.ST"]));
    expect(maxInFlight).toBeLessThanOrEqual(2);
    expect(batch.inputCount).toBe(6);
    expect(batch.uniqueTickerCount).toBe(4);
    expect(batch.results).toHaveLength(4);
    expect(batch.results.find((item) => item.requestedTicker === "BROKEN")).toMatchObject({
      ok: false,
      stage: "analysis",
      reason: "audit_exception",
    });
    expect(batch.summary.successful).toBe(3);
    expect(batch.summary.failed).toBe(1);
  });
});
