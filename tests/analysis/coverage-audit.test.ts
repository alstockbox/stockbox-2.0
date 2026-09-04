import { describe, expect, it } from "vitest";
import { analyzeFinancials, buildCoverageAudit, type FinancialAnalysisInput } from "../../src/lib/analysis";
import { durableCompounderInput } from "./fixtures";
import { goldenAnalysisFixtures } from "./golden-fixtures";

function analyze(overrides: Partial<FinancialAnalysisInput> = {}) {
  return analyzeFinancials({
    ...durableCompounderInput,
    ...overrides,
    analysisDate: overrides.analysisDate ?? "2026-08-25T00:00:00.000Z",
    company: { ...durableCompounderInput.company, ...overrides.company },
    market: { ...durableCompounderInput.market, ...overrides.market },
  });
}

describe("coverage audit", () => {
  it("separates metric coverage from score coverage and excludes not-applicable metrics", () => {
    const annualPeriods = durableCompounderInput.annualPeriods.map((period, index) => index === durableCompounderInput.annualPeriods.length - 1 ? {
      ...period,
      ebitda: -20,
      netIncome: -15,
      netIncomeCommonStockholders: -15,
    } : period);
    const result = analyze({ annualPeriods });
    const audit = buildCoverageAudit({ ticker: "TEST", result });

    expect(audit.ticker).toBe("TEST");
    expect(audit.archetype).toBe("standard");
    expect(audit.scoreCoverage).toBe(result.dataCoverage);
    expect(audit.metricCoverage).toBeGreaterThanOrEqual(0);
    expect(audit.metricCoverage).toBeLessThanOrEqual(1);

    const pe = audit.metrics.find((metric) => metric.category === "valuation" && metric.label === "P/E");
    const evEbitda = audit.metrics.find((metric) => metric.category === "valuation" && metric.label === "EV / EBITDA");
    expect(pe).toMatchObject({ status: "NOT_APPLICABLE", relevant: false, available: false });
    expect(evEbitda).toMatchObject({ status: "NOT_APPLICABLE", relevant: false, available: false });
    expect(audit.rootCauseCounts.NOT_APPLICABLE).toBeGreaterThanOrEqual(2);
  });

  it("classifies provider-backed missing metrics and preserves the human-readable reason", () => {
    const annualPeriods = durableCompounderInput.annualPeriods.map((period, index) => index === durableCompounderInput.annualPeriods.length - 1 ? {
      ...period,
      operatingCashFlow: null,
      capitalExpenditures: null,
      freeCashFlow: null,
    } : period);
    const result = analyze({
      annualPeriods,
      providerDiagnostics: [{
        provider: "fixture-fundamentals",
        capability: "fundamentals",
        status: "partial",
        reason: "Operating cash flow was not returned by the provider.",
        observedAt: "2026-08-25T00:00:00.000Z",
      }],
    });
    const audit = buildCoverageAudit({ ticker: "TEST", result });
    const fcfYield = audit.metrics.find((metric) => metric.category === "valuation" && metric.label === "FCF yield");

    expect(fcfYield).toMatchObject({
      status: "PROVIDER_MISSING",
      relevant: true,
      available: false,
    });
    expect(fcfYield?.reason).toContain("operating cash flow and capex");
    expect(audit.categories.valuation.missing).toBeGreaterThan(0);
    expect(audit.rootCauseCounts.PROVIDER_MISSING).toBeGreaterThan(0);
  });

  it("assigns an explicit specialist coverage cause when a REIT metric has no provider value", () => {
    const fixture = goldenAnalysisFixtures.find((item) => item.id === "reit-missing-ffo");
    expect(fixture).toBeDefined();
    const result = analyzeFinancials({
      ...structuredClone(fixture!.input),
      providerDiagnostics: [{
        provider: "fixture-sec",
        capability: "fundamentals",
        status: "unavailable",
        reason: "not_configured",
        observedAt: "2026-08-25T00:00:00.000Z",
      }],
    });
    const audit = buildCoverageAudit({ ticker: "REIT", result });
    const ffoYield = audit.metrics.find((metric) => metric.category === "valuation" && metric.label === "FFO yield");

    expect(ffoYield).toMatchObject({
      status: "PROVIDER_MISSING",
      relevant: true,
      available: false,
      providerDiagnostics: [],
    });
    expect(ffoYield?.reason).toContain("specialized REIT data");
  });

  it("returns category coverage from relevant metric counts instead of treating unsuitable metrics as missing", () => {
    const result = analyze();
    const audit = buildCoverageAudit({ ticker: "TEST", result });

    for (const category of Object.values(audit.categories)) {
      expect(category.relevant).toBe(category.available + category.missing);
      expect(category.coverage).toBe(category.relevant > 0 ? category.available / category.relevant : 1);
    }
    expect(audit.relevantMetricCount).toBe(audit.availableMetricCount + audit.missingMetricCount);
    expect(audit.notApplicableMetricCount).toBe(
      audit.metrics.filter((metric) => metric.status === "NOT_APPLICABLE").length,
    );
  });
});
