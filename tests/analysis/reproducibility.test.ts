import { describe, expect, it, vi } from "vitest";
import {
  analyzeFinancials,
  buildAnalysis,
  buildBatchQaResult,
  toFinancialAnalysisInput,
  type AnalysisInput,
} from "../../src/lib/analysis";
import { durableCompounderInput } from "./fixtures";

const fixedCanonicalInput = {
  ...durableCompounderInput,
  analysisDate: "2026-08-25T12:00:00.000Z",
  company: {
    ...durableCompounderInput.company,
    entityId: "issuer:box-systems",
    entityIdentityConfidence: 100,
    reportingCurrency: "USD",
    tradingCurrency: "USD",
  },
  annualPeriods: durableCompounderInput.annualPeriods.map((period, index) => ({
    ...period,
    periodEndDate: `${2021 + index}-12-31`,
    currency: "USD",
  })),
  market: {
    ...durableCompounderInput.market,
    currency: "USD",
    priceDate: "2026-08-24",
    marketCapAsOf: "2026-08-24",
    sharesOutstandingAsOf: "2026-08-24",
  },
};

describe("canonical analysis reproducibility", () => {
  it("produces the same engine result and fingerprint for the same normalized input", () => {
    const first = analyzeFinancials(structuredClone(fixedCanonicalInput));
    const second = analyzeFinancials(structuredClone(fixedCanonicalInput));

    expect(first.canonicalInputFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(second.canonicalInputFingerprint).toBe(first.canonicalInputFingerprint);
    expect(second).toEqual(first);
  });

  it("changes the fingerprint when an analyzed financial fact changes", () => {
    const first = analyzeFinancials(structuredClone(fixedCanonicalInput));
    const changed = structuredClone(fixedCanonicalInput);
    changed.annualPeriods.at(-1)!.revenue! += 1;
    const second = analyzeFinancials(changed);

    expect(second.canonicalInputFingerprint).not.toBe(first.canonicalInputFingerprint);
  });

  it("includes the effective analysis date in the fingerprint when the caller omits it", () => {
    const undated = { ...structuredClone(fixedCanonicalInput), analysisDate: undefined };
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-08-25T12:00:00.000Z"));
      const first = analyzeFinancials(structuredClone(undated));
      vi.setSystemTime(new Date("2026-08-26T12:00:00.000Z"));
      const second = analyzeFinancials(structuredClone(undated));
      expect(second.canonicalInputFingerprint).not.toBe(first.canonicalInputFingerprint);
    } finally {
      vi.useRealTimers();
    }
  });

  it("carries model, score-policy and benchmark versions in methodology", () => {
    const result = analyzeFinancials(fixedCanonicalInput);

    expect(result.modelVersion).toMatch(/v2/);
    expect(result.scores.methodology).toEqual(expect.objectContaining({
      modelVersion: result.modelVersion,
      scorePolicyVersion: expect.any(String),
      benchmarkVersion: expect.any(String),
    }));
  });

  it("honors an injected analysis date in the legacy-to-canonical bridge", () => {
    const input: AnalysisInput = {
      company: { ticker: "BOX", name: "Box Systems", entityId: "issuer:box-systems" },
      market: null,
      fundamentals: null,
      analysisType: "summary",
      investmentProfile: "balanced",
      analysisDate: "2026-01-02T03:04:05.000Z",
    };

    expect(toFinancialAnalysisInput(input).analysisDate).toBe("2026-01-02T03:04:05.000Z");
  });

  it("derives batch provider versions and persists the canonical fingerprint in QA output", () => {
    const report = buildAnalysis({
      company: { ticker: "BOX", name: "Box Systems", entityId: "issuer:box-systems" },
      market: null,
      fundamentals: null,
      analysisType: "summary",
      investmentProfile: "balanced",
      analysisDate: "2026-01-02T03:04:05.000Z",
    });
    report.sources = [{
      name: "SEC Companyfacts",
      url: "https://data.sec.gov/example",
      accessedAt: "2026-01-02T03:04:05.000Z",
      dataAsOf: "2025-12-31",
      freshness: "test",
      provider: "sec-companyfacts",
      capability: "fundamentals",
      version: "sec-companyfacts-adapter-v3",
    }];
    const qa = buildBatchQaResult({
      batchId: "batch-1",
      rerunKey: "run-1",
      report,
      analysisInput: toFinancialAnalysisInput({
        company: { ticker: "BOX", name: "Box Systems", entityId: "issuer:box-systems" },
        market: null,
        fundamentals: null,
        analysisType: "summary",
        investmentProfile: "balanced",
        analysisDate: "2026-01-02T03:04:05.000Z",
      }),
    });

    expect(qa.providerVersions).toEqual({ "sec-companyfacts": "sec-companyfacts-adapter-v3" });
    expect(qa.canonicalInputFingerprint).toBe(report.engine?.canonicalInputFingerprint);
  });
});
