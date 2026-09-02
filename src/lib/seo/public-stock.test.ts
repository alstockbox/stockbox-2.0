import { describe, expect, it } from "vitest";
import type { AnalysisReport } from "@/lib/analysis/types";
import {
  buildStockMetaDescription,
  evaluatePublicSnapshot,
  normalizePercent,
  sanitizePublicReport,
  slugifyStockPage,
} from "./public-stock";

function report(overrides: Partial<AnalysisReport> = {}): AnalysisReport {
  return {
    id: "analysis-1",
    ticker: "MYCR.ST",
    companyName: "Mycronic AB",
    analysisType: "deep",
    investmentProfile: "balanced",
    generatedAt: "2026-09-01T12:00:00.000Z",
    oneSentence: "Mycronic combines strong profitability with a demanding valuation.",
    summary: "A source-backed StockBox snapshot focused on valuation, growth, profitability, financial health, quality and risk.",
    recommendation: "Hold",
    shortTermAssessment: "Balanced short-term research view.",
    longTermAssessment: "Balanced long-term research view.",
    metrics: {
      revenueGrowth1y: 0.12,
      revenueCagr3y: 0.15,
      epsGrowth1y: 0.11,
      grossMargin: 0.48,
      operatingMargin: 0.24,
      netMargin: 0.19,
      fcf: 100,
      fcfMargin: 0.15,
      cashConversion: 1.1,
      debtToEquity: 0.2,
      debtToAssets: 0.1,
      netDebt: -50,
      interestCoverage: 20,
      earningsYield: 0.03,
      fcfYield: 0.025,
      priceMomentum1y: 0.4,
      priceMomentum3m: 0.1,
    },
    score: {
      score: 83,
      personalizedScore: 83,
      confidence: 0.84,
      dimensions: [],
      missingData: [],
    },
    dcf: { suitable: false, bear: null, base: null, bull: null },
    redFlags: [],
    greenFlags: [],
    scenarios: [],
    sources: [],
    disclaimer: "Not individualized financial advice.",
    dataCoverage: 0.82,
    dataStatus: "current",
    dataAsOf: "2026-08-31T00:00:00.000Z",
    adminQa: { passed: true } as never,
    ...overrides,
  };
}

function etfReport(): AnalysisReport {
  return {
    ...report({ ticker: "SPY", companyName: "SPDR S&P 500 ETF Trust" }),
    securityClassification: { kind: "equity_etf", confidence: 0.99, reason: "ETF classification" },
    securityAnalysis: {
      etf: {
        kind: "etf",
        subtype: "broad_market",
        score: { coverage: 0.9, factors: [] },
        warnings: [],
      },
    },
  } as unknown as AnalysisReport;
}

describe("slugifyStockPage", () => {
  it("creates stable Swedish-safe stock slugs", () => {
    expect(slugifyStockPage("  ÅF Pöyry / Class B  ")).toBe("af-poyry-class-b");
  });
});

describe("normalizePercent", () => {
  it("normalizes fractional and percentage values to 0-1", () => {
    expect(normalizePercent(0.84)).toBe(0.84);
    expect(normalizePercent(84)).toBe(0.84);
    expect(normalizePercent(null)).toBeNull();
  });
});

describe("evaluatePublicSnapshot", () => {
  it("accepts a balanced current report with enough score confidence and coverage", () => {
    expect(evaluatePublicSnapshot(report())).toEqual({ eligible: true, reasons: [] });
  });

  it("rejects personalized, stale and low-coverage reports", () => {
    const result = evaluatePublicSnapshot(report({
      investmentProfile: "growth",
      dataStatus: "stale",
      dataCoverage: 0.4,
      score: { ...report().score, confidence: 0.5 },
    }));
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("balanced_profile_required");
    expect(result.reasons).toContain("current_data_required");
    expect(result.reasons).toContain("minimum_coverage_not_met");
    expect(result.reasons).toContain("minimum_confidence_not_met");
  });
});

describe("sanitizePublicReport", () => {
  it("removes admin-only QA payloads", () => {
    const sanitized = sanitizePublicReport(report());
    expect(sanitized.adminQa).toBeUndefined();
    expect(sanitized.ticker).toBe("MYCR.ST");
  });
});

describe("buildStockMetaDescription", () => {
  it("creates a concise Swedish stock description with company, ticker and StockBox score", () => {
    const description = buildStockMetaDescription(report());
    expect(description).toContain("Mycronic AB");
    expect(description).toContain("MYCR.ST");
    expect(description).toContain("83/100");
    expect(description).toContain("aktieanalys");
    expect(description.length).toBeLessThanOrEqual(160);
  });

  it("does not describe an ETF as an ordinary stock/company-fundamentals analysis", () => {
    const description = buildStockMetaDescription(etfReport());
    expect(description).toContain("ETF-analys");
    expect(description).toContain("kostnad");
    expect(description).toContain("risk");
    expect(description).not.toContain("aktieanalys");
    expect(description).not.toContain("lönsamhet");
    expect(description.length).toBeLessThanOrEqual(160);
  });

  it("uses investment-company intent for holding-company reports", () => {
    const holding = report({ companyName: "Investor AB", ticker: "INVE-B.ST", analysisArchetype: "holding_company" });
    const description = buildStockMetaDescription(holding);
    expect(description).toContain("investmentbolagsanalys");
    expect(description).toContain("NAV");
    expect(description).toContain("substans");
    expect(description).not.toContain("aktieanalys");
    expect(description.length).toBeLessThanOrEqual(160);
  });
});
