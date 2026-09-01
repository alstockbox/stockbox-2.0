import { describe, expect, it } from "vitest";
import { buildPeerBenchmarkComparison } from "../../src/lib/analysis/peer-benchmark";
import { buildAnalysis, type AnalysisInput } from "../../src/lib/analysis";

function period(year: number, revenue: number, operatingIncome: number, netIncome: number) {
  return {
    fiscalYear: year,
    periodEndDate: `${year}-12-31`,
    revenue,
    grossProfit: revenue * 0.7,
    operatingIncome,
    netIncome,
    epsDiluted: netIncome / 100,
    operatingCashFlow: netIncome * 1.2,
    capitalExpenditures: -10,
    freeCashFlow: netIncome * 1.2 - 10,
    cashAndEquivalents: 100,
    totalDebt: 50,
    totalEquity: 500,
    totalAssets: 800,
    currentAssets: 300,
    currentLiabilities: 120,
    interestExpense: -4,
    sharesDiluted: 100,
    currentSharesOutstanding: 100,
  };
}

describe("peer benchmark comparison", () => {
  it("uses versioned sector benchmarks and does not imply live peer medians", () => {
    const input: AnalysisInput = {
      company: { ticker: "FIX", name: "Fixture Corp", country: "US", currency: "USD" },
      market: { ticker: "FIX", price: 12, currency: "USD", date: "2026-08-31", volume: 1_000, yearHigh: 20, yearLow: 8, provider: "fixture", performance: {} },
      fundamentals: {
        ticker: "FIX",
        name: "Fixture Corp",
        sector: "Technology",
        industry: "Software",
        annual: [],
        annualPeriods: [
          period(2023, 100, 10, 8),
          period(2024, 125, 20, 18),
          period(2025, 150, 36, 30),
          period(2026, 190, 57, 45),
        ],
        reportingCurrency: "USD",
      },
      analysisType: "research",
      investmentProfile: "balanced",
      analysisDate: "2026-08-31T00:00:00.000Z",
    };
    const report = buildAnalysis(input);
    report.engine!.metrics.valuation.freeCashFlowYield = 0.1;
    const comparison = buildPeerBenchmarkComparison(report);

    expect(comparison.status).toBe("benchmark_only");
    expect(comparison.benchmarkVersion).toBe(report.engine?.scores.methodology.benchmarkVersion);
    expect(comparison.missingReasons[0]).toContain("Live peer constituents");
    expect(comparison.rows.some((row) => row.status === "strong")).toBe(true);
    expect(comparison.rows.filter((row) => row.status !== "unavailable").every((row) => row.note.includes("not a live peer median"))).toBe(true);
  });

  it("does not compare holding companies on generic P/E, EV/EBITDA or revenue benchmarks", () => {
    const comparison = buildPeerBenchmarkComparison({
      engine: {
        analysisArchetype: "holding_company",
        metrics: {
          valuation: { priceEarnings: 4.8, evEbitda: 14.9, evSales: 4.2, freeCashFlowYield: 0.015 },
          growth: { revenueGrowthYoY: 0.282 },
          margins: { operatingMargin: 0.8 },
          ratios: { returnOnInvestedCapital: 0.2, netDebtToEbitda: 2, interestCoverage: 6 },
        },
        scores: { sector: "financials", methodology: { benchmarkVersion: "fixture" } },
      },
    } as never);

    expect(comparison.status).toBe("unavailable");
    expect(comparison.rows).toEqual([]);
    expect(comparison.missingReasons.join(" ")).toMatch(/NAV|SOTP/i);
  });

  it("fails closed when traceable engine metrics are unavailable", () => {
    const comparison = buildPeerBenchmarkComparison({
      ticker: "MISS",
      companyName: "Missing Metrics",
      score: { sector: "technology", methodology: { benchmarkVersion: "fixture" } },
    } as never);

    expect(comparison.status).toBe("unavailable");
    expect(comparison.rows).toEqual([]);
    expect(comparison.summary).toContain("unavailable");
  });
});
