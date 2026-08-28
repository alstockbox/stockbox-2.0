import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportView } from "../../src/components/analysis/report-view";
import { buildAnalysis, type AnalysisInput, type AnalysisReport } from "../../src/lib/analysis";
import { durableCompounderInput } from "./fixtures";

function sekInput(): AnalysisInput {
  return {
    company: { ticker: "BOX.ST", name: "Box Systems AB", country: "SE", exchange: "Nasdaq Stockholm", currency: "SEK" },
    analysisType: "numbers",
    investmentProfile: "balanced",
    market: {
      ticker: "BOX.ST",
      price: 300,
      currency: "SEK",
      date: "2026-08-28",
      volume: 1000,
      yearHigh: 350,
      yearLow: 200,
      performance: { "3M": 0.1, "1Y": 0.2 },
    },
    fundamentals: {
      ticker: "BOX.ST",
      name: "Box Systems AB",
      reportingCurrency: "SEK",
      sector: "technology",
      industry: "Cloud software",
      analysisArchetype: "software_growth",      annual: durableCompounderInput.annualPeriods.map((period) => ({
        fiscalYear: period.fiscalYear as number,
        revenue: period.revenue ?? null,
        grossProfit: period.grossProfit ?? null,
        operatingIncome: period.operatingIncome ?? null,
        netIncome: period.netIncome ?? null,
        epsDiluted: period.epsDiluted ?? null,
        operatingCashFlow: period.operatingCashFlow ?? null,
        capex: period.capitalExpenditures ?? null,
        assets: period.totalAssets ?? null,
        liabilities: period.totalLiabilities ?? null,
        cash: period.cashAndEquivalents ?? null,
        debt: period.totalDebt ?? null,
        equity: period.totalEquity ?? null,
        interestExpense: period.interestExpense ?? null,
        ebitda: period.ebitda,
        currentAssets: period.currentAssets,
        currentLiabilities: period.currentLiabilities,
        sharesDiluted: period.sharesDiluted,
        currency: "SEK",
      })),
    },
  };
}

describe("analysis report currency contract", () => {
  it("persists verified reporting currency on the report", () => {
    const report = buildAnalysis(sekInput()) as AnalysisReport & { reportingCurrency?: string | null };
    expect(report.reportingCurrency).toBe("SEK");
  });
  it("renders statement currency metrics with the report currency instead of USD", () => {
    const report = buildAnalysis(sekInput()) as AnalysisReport & { reportingCurrency?: string | null };
    expect(report.metrics.fcf).not.toBeNull();
    const markup = renderToStaticMarkup(createElement(ReportView, { report, mode: "pro", locale: "en" }));
    const fcf = report.metrics.fcf as number;
    const sekFcf = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "SEK",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(fcf);
    const usdFcf = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(fcf);
    expect(markup).toContain(sekFcf);
    expect(markup).not.toContain(usdFcf);
  });
});