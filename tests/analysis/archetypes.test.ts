import { describe, expect, it } from "vitest";
import { analyzeFinancials, type AnalysisArchetype, type FinancialAnalysisInput } from "../../src/lib/analysis";
import { durableCompounderInput } from "./fixtures";

function asArchetype(analysisArchetype: AnalysisArchetype, overrides: Partial<FinancialAnalysisInput> = {}) {
  return analyzeFinancials({
    ...durableCompounderInput,
    ...overrides,
    company: { ...durableCompounderInput.company, ...overrides.company, analysisArchetype },
  });
}

describe("archetype-specific analysis", () => {
  it("uses ordinary FCFF only for a standard operating company", () => {
    expect(asArchetype("standard").dcf.status).toBe("available");
  });

  it("keeps balanced profile weights anchored to the bank sector model", () => {
    const result = asArchetype("bank", { company: { sector: "financials", investmentProfile: "balanced" } });
    expect(result.scores.methodology.personalizedWeights).toEqual(result.scores.methodology.sectorWeights);
  });

  it("does not run corporate FCFF for a bank", () => {
    const result = asArchetype("bank", { company: { sector: "financials" } });
    expect(result.dcf.status).toBe("inappropriate");
    expect(result.dcf.method).toContain("Residual income");
    expect(result.scores.dimensions.financialHealth.contributors?.some((item) => item.label === "Net debt / EBITDA")).toBe(false);
    expect(result.missingData.map((item) => item.field)).toEqual(expect.arrayContaining([
      "netInterestMargin",
      "cet1CapitalRatio",
      "grossLoans",
      "deposits",
      "nonperformingLoans",
      "netChargeOffs",
      "tangibleCommonEquity",
    ]));
  });

  it("routes a P&C insurer to equity-oriented valuation", () => {
    const result = asArchetype("insurer", { company: { sector: "financials", industry: "Property and casualty insurance" } });
    expect(result.dcf.status).toBe("inappropriate");
    expect(result.scores.dimensions.valuation.contributors?.map((item) => item.label)).toEqual(["P / Book", "P / E"]);
  });

  it("does not let P/E dominate a REIT", () => {
    const result = asArchetype("reit", { company: { sector: "realEstate" } });
    expect(result.dcf.method).toBe("AFFO / NAV");
    expect(result.scores.dimensions.valuation.contributors?.map((item) => item.label)).toEqual(["FFO yield"]);
    expect(result.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "fundsFromOperations", reason: expect.stringContaining("not substituted") }),
      expect.objectContaining({ field: "adjustedFundsFromOperations", reason: expect.stringContaining("not substituted") }),
    ]));
  });

  it("adds dilution and SBC discipline for software growth", () => {
    const result = asArchetype("software_growth", { company: { sector: "technology", industry: "Cloud software" } });
    expect(result.scores.dimensions.quality.contributors?.some((item) => item.label === "SBC / revenue")).toBe(true);
    expect(result.scores.dimensions.growth.contributors?.some((item) => item.label === "Growth + FCF margin")).toBe(true);
  });

  it("does not reward unprofitable high growth without cash and dilution checks", () => {
    const annualPeriods = durableCompounderInput.annualPeriods.map((period, index) => ({
      ...period,
      revenue: 100 * 1.4 ** index,
      grossProfit: 75 * 1.4 ** index,
      operatingIncome: -40,
      netIncome: -50,
      operatingCashFlow: -25,
      capitalExpenditures: 10,
      stockBasedCompensation: 30,
      sharesDiluted: 100 + index * 15,
    }));
    const result = asArchetype("software_growth", { annualPeriods });
    expect(result.metrics.valuation.priceEarnings).toBeNull();
    expect(result.dcf.status).toBe("unavailable");
    expect(["Buy", "Strong Buy"]).not.toContain(result.recommendation.rating);
  });

  it("requires through-cycle coverage for a cyclical company", () => {
    const result = asArchetype("cyclical", { company: { sector: "energy" } });
    expect(result.scores.dimensions.growth.contributors?.map((item) => item.label)).toEqual(["Revenue CAGR 5Y", "FCF stability"]);
    expect(result.dcf.method).toBe("Normalized FCFF DCF");
  });

  it("uses cash runway and refuses fake earnings valuation for pre-revenue biotech", () => {
    const periods = durableCompounderInput.annualPeriods.map((period) => ({
      ...period,
      revenue: null,
      grossProfit: null,
      operatingIncome: -80,
      netIncome: -90,
      operatingCashFlow: -70,
      capitalExpenditures: 10,
      researchAndDevelopment: 75,
    }));
    const result = asArchetype("pre_revenue_biotech", { company: { sector: "healthcare" }, annualPeriods: periods });
    expect(result.dcf.status).toBe("inappropriate");
    expect(result.scores.dimensions.valuation.score).toBeNull();
    expect(result.scores.dimensions.financialHealth.contributors?.some((item) => item.label === "Cash runway (years)")).toBe(true);
  });

  it("requires NAV/SOTP for a holding company", () => {
    const result = asArchetype("holding_company", { company: { sector: "financials" } });
    expect(result.dcf.method).toBe("NAV / SOTP");
    expect(result.scores.dimensions.profitability.score).toBeNull();
  });

  it("allows a utility FCFF route while retaining utility thresholds", () => {
    const result = asArchetype("utility", { company: { sector: "utilities" } });
    expect(result.dcf.status).toBe("available");
    expect(result.scores.analysisArchetype).toBe("utility");
  });

  it("does not award Growth 100 when only EPS growth exists", () => {
    const input: FinancialAnalysisInput = {
      company: { ticker: "EPS", sector: "technology", analysisArchetype: "standard" },
      annualPeriods: [
        { fiscalYear: 2023, epsDiluted: 1, totalAssets: 10, totalEquity: 5 },
        { fiscalYear: 2024, epsDiluted: 2, totalAssets: 12, totalEquity: 6 },
      ],
    };
    const result = analyzeFinancials(input);
    expect(result.scores.dimensions.growth.coverage).toBeLessThan(0.5);
    expect(result.scores.dimensions.growth.score).toBeNull();
    expect(result.recommendation.rating).toBe("No Rating");
  });

  it("penalizes a high dividend that is not covered by free cash flow", () => {
    const annualPeriods = durableCompounderInput.annualPeriods.map((period) => ({
      ...period,
      dividendsPaid: period.fiscalYear === 2024 ? 400 : 250,
    }));
    const result = analyzeFinancials({
      ...durableCompounderInput,
      company: { ...durableCompounderInput.company, investmentProfile: "dividend", analysisArchetype: "standard" },
      annualPeriods,
    });
    const payout = result.scores.dimensions.cashFlow.contributors?.find((item) => item.label === "FCF payout ratio");
    expect(payout?.value).toBeGreaterThan(1);
    expect(payout?.score).toBeLessThan(30);
  });
});
