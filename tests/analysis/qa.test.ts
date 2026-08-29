import { describe, expect, it } from "vitest";
import { analyzeFinancials, buildBatchQaResult, presentAnalysisReport } from "../../src/lib/analysis";
import type { AnalysisInput } from "../../src/lib/analysis";
import { durableCompounderInput } from "./fixtures";
import { SCORE_COVERAGE_POLICY } from "../../src/lib/analysis/config";

function qaFromCanonical(canonicalInput: typeof durableCompounderInput) {
  const legacyInput: AnalysisInput = {
    company: { ticker: "BOX", name: "Box Systems" },
    market: { ticker: "BOX", price: 30, currency: "USD", date: null, volume: null, yearHigh: null, yearLow: null, performance: {} },
    fundamentals: null,
    analysisType: "summary",
    investmentProfile: "balanced",
  };
  const result = analyzeFinancials(canonicalInput);
  const report = presentAnalysisReport(legacyInput, canonicalInput, result);
  return { report, qa: buildBatchQaResult({ batchId: "batch-1", rerunKey: "run-1", report, analysisInput: canonicalInput }) };
}

describe("batch QA diagnostics", () => {
  it("surfaces financial-versus-market currency mismatch as a dedicated QA flag", () => {
    const canonicalInput = {
      ...durableCompounderInput,
      market: { ...durableCompounderInput.market, currency: "SEK" },
    };
    const legacyInput: AnalysisInput = {
      company: { ticker: "BOX", name: "Box Systems" },
      market: { ticker: "BOX", price: 30, currency: "SEK", date: null, volume: null, yearHigh: null, yearLow: null, performance: {} },
      fundamentals: null,
      analysisType: "summary",
      investmentProfile: "balanced",
    };
    const result = analyzeFinancials(canonicalInput);
    const report = presentAnalysisReport(legacyInput, canonicalInput, result);
    const qa = buildBatchQaResult({ batchId: "batch-1", rerunKey: "run-1", report, analysisInput: canonicalInput });

    expect(qa.flags).toContain("CURRENCY_MISMATCH");
  });
});

it("uses the canonical overall coverage policy for LOW_COVERAGE", () => {
  const { report } = qaFromCanonical(durableCompounderInput);
  report.dataCoverage = SCORE_COVERAGE_POLICY.overallMinimum - 0.01;
  const qa = buildBatchQaResult({
    batchId: "batch-1",
    rerunKey: "run-1",
    report,
    analysisInput: durableCompounderInput,
  });

  expect(qa.flags).toContain("LOW_COVERAGE");
});

it("distinguishes a successful market fallback from final market unavailability", () => {
  const canonicalInput = {
    ...durableCompounderInput,
    providerDiagnostics: [
      { provider: "Stooq", capability: "market_data" as const, status: "unavailable" as const, observedAt: "2026-08-25" },
      { provider: "Yahoo chart", capability: "market_data" as const, status: "available" as const, observedAt: "2026-08-25" },
    ],
  };
  const { qa } = qaFromCanonical(canonicalInput);

  expect(qa.flags).toContain("FALLBACK_USED");
  expect(qa.flags).not.toContain("MARKET_PROVIDER_ERROR");
});

it("does not treat market cap alone as usable valuation coverage", () => {
  const canonicalInput = {
    ...durableCompounderInput,
    company: { ...durableCompounderInput.company, reportingCurrency: undefined, currency: undefined },
    annualPeriods: durableCompounderInput.annualPeriods.map((period) => ({ ...period, currency: undefined })),
    market: { ...durableCompounderInput.market, currency: "USD" },
  };
  const { report } = qaFromCanonical(canonicalInput);
  if (!report.engine) throw new Error("Expected engine result.");
  report.engine.metrics.valuation = {
    marketCap: 1_000,
    enterpriseValue: null,
    priceEarnings: null,
    priceSales: null,
    priceBook: null,
    priceTangibleBook: null,
    evSales: null,
    evEbitda: null,
    freeCashFlowYield: null,
    earningsYield: null,
    peg: null,
  };
  const qa = buildBatchQaResult({ batchId: "batch-1", rerunKey: "run-1", report, analysisInput: canonicalInput });

  expect(qa.flags).toContain("VALUATION_UNAVAILABLE");
});

it("flags missing insurer specialist data", () => {
  const canonicalInput = {
    ...durableCompounderInput,
    company: { ...durableCompounderInput.company, sector: "financials" as const, analysisArchetype: "insurer" as const },
  };
  const { qa } = qaFromCanonical(canonicalInput);

  expect(qa.flags).toContain("SPECIALIZED_DATA_MISSING");
});
