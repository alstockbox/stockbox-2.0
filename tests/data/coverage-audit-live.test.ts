import { describe, expect, it, vi } from "vitest";
import {
  analyzeFinancials,
  type AnalysisReport,
  type CompanySearchResult,
} from "../../src/lib/analysis";
import { coverageAudit } from "../../src/lib/data/coverage-audit";
import { durableCompounderInput } from "../analysis/fixtures";

const company: CompanySearchResult = {
  ticker: "AAPL",
  canonicalTicker: "AAPL",
  name: "Apple Inc.",
  exchange: "NASDAQ",
  country: "US",
  currency: "USD",
  entityId: "sec:0000320193",
  cik: "0000320193",
  securityType: "Common Stock",
};

function successfulReport(): AnalysisReport {
  const engine = analyzeFinancials({
    ...durableCompounderInput,
    company: {
      ...durableCompounderInput.company,
      canonicalTicker: "AAPL",
      entityId: company.entityId,
      name: company.name,
    },
    analysisDate: "2026-08-25T00:00:00.000Z",
  });
  return {
    id: "analysis-aapl",
    ticker: "AAPL",
    companyName: "Apple Inc.",
    generatedAt: "2026-08-25T00:00:00.000Z",
    analysisType: "numbers",
    investmentProfile: "balanced",
    oneSentence: "fixture",
    summary: "fixture",
    recommendation: engine.recommendation.rating,
    shortTermAssessment: "fixture",
    longTermAssessment: "fixture",
    metrics: {} as AnalysisReport["metrics"],
    score: {
      score: engine.scores.stockBoxScore,
      personalizedScore: engine.scores.personalizedScore,
      confidence: engine.scores.confidence,
      dimensions: Object.values(engine.scores.dimensions),
      missingData: [],
    },
    dcf: {} as AnalysisReport["dcf"],
    redFlags: [],
    greenFlags: [],
    scenarios: [],
    sources: [],
    disclaimer: "fixture",
    dataCoverage: engine.dataCoverage,
    dataStatus: engine.dataStatus,
    scenarioStatus: engine.scenarioStatus,
    engine,
  };
}

describe("live ticker coverage audit", () => {
  it("resolves the canonical listing, runs the real analysis contract, and returns compact diagnostics", async () => {
    const report = successfulReport();
    const searchCompanies = vi.fn(async () => [company]);
    const resolveCanonicalCompanySelection = vi.fn(() => ({ ok: true as const, company }));
    const analyzeCompany = vi.fn(async () => ({ ok: true as const, data: report, sources: [], warnings: ["fixture warning"] }));

    const result = await coverageAudit("aapl", {
      dependencies: { searchCompanies, resolveCanonicalCompanySelection, analyzeCompany },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(searchCompanies).toHaveBeenCalledWith("AAPL");
    expect(analyzeCompany).toHaveBeenCalledWith({
      company,
      analysisType: "numbers",
      investmentProfile: "balanced",
    });
    expect(result.requestedTicker).toBe("AAPL");
    expect(result.resolvedTicker).toBe("AAPL");
    expect(result.companyName).toBe("Apple Inc.");
    expect(result.audit.ticker).toBe("AAPL");
    expect(result.report.enginePresent).toBe(true);
    expect(result.report.sourceCount).toBe(0);
    expect(result.report.warningCount).toBe(1);
    expect(result.report.missingDataCount).toBe(report.engine?.missingData.length ?? 0);
    expect(result.report.reconciliationWarningCount).toBe(
      report.engine?.reconciliation.filter((item) => item.status === "warning").length ?? 0,
    );
  });

  it("fails closed on ambiguous ticker identity instead of auditing the wrong company", async () => {
    const searchCompanies = vi.fn(async () => [company, { ...company, entityId: "other" }]);
    const resolveCanonicalCompanySelection = vi.fn(() => ({ ok: false as const, reason: "ambiguous" as const }));
    const analyzeCompany = vi.fn();

    const result = await coverageAudit("AAPL", {
      dependencies: { searchCompanies, resolveCanonicalCompanySelection, analyzeCompany },
    });

    expect(result).toMatchObject({
      ok: false,
      requestedTicker: "AAPL",
      stage: "resolution",
      reason: "ambiguous",
      candidateCount: 2,
    });
    expect(analyzeCompany).not.toHaveBeenCalled();
  });

  it("preserves provider diagnostics when analysis fails", async () => {
    const searchCompanies = vi.fn(async () => [company]);
    const resolveCanonicalCompanySelection = vi.fn(() => ({ ok: true as const, company }));
    const analyzeCompany = vi.fn(async () => ({
      ok: false as const,
      error: "Fundamental data is unavailable for this company.",
      sources: [],
      warnings: ["fundamentals unavailable"],
      providerDiagnostics: [{
        provider: "Yahoo Finance fundamentals",
        capability: "fundamentals" as const,
        status: "unavailable" as const,
        reason: "empty_response",
        observedAt: "2026-08-25T00:00:00.000Z",
      }],
    }));

    const result = await coverageAudit("AAPL", {
      dependencies: { searchCompanies, resolveCanonicalCompanySelection, analyzeCompany },
    });

    expect(result).toMatchObject({
      ok: false,
      stage: "analysis",
      requestedTicker: "AAPL",
      resolvedTicker: "AAPL",
      reason: "Fundamental data is unavailable for this company.",
      providerDiagnostics: [expect.objectContaining({
        capability: "fundamentals",
        status: "unavailable",
      })],
    });
  });
});
