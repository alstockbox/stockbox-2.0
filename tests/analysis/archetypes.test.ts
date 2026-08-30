import { describe, expect, it } from "vitest";
import { analyzeFinancials, type AnalysisArchetype, type FinancialAnalysisInput } from "../../src/lib/analysis";
import { durableCompounderInput } from "./fixtures";

const specializedMetric = (value: number | null) => ({ value, dataAsOf: "2026-06-30" });

function asArchetype(analysisArchetype: AnalysisArchetype, overrides: Partial<FinancialAnalysisInput> = {}) {
  return analyzeFinancials({
    ...durableCompounderInput,
    ...overrides,
    company: { ...durableCompounderInput.company, ...overrides.company, analysisArchetype },
  });
}

describe("archetype-specific analysis", () => {
  it("uses ordinary FCFF only for a standard operating company", () => {
    const result = asArchetype("standard", {
      analysisDate: "2026-08-25T00:00:00.000Z",
      market: { ...durableCompounderInput.market, currency: "USD", priceDate: "2026-08-24", marketCapAsOf: "2026-08-24", sharesOutstandingAsOf: "2026-08-24" },
    });
    expect(result.dcf.status).toBe("available");
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
    expect(result.scores.dimensions.valuation.contributors?.map((item) => item.label)).toEqual(["P / Tangible Book", "P / Book", "P / E"]);
    expect(result.scores.specializedCoverage?.overall).toBe(0);
    expect(result.recommendation.rating).toBe("No Rating");
    expect(result.missingData.map((item) => item.field)).toEqual(expect.arrayContaining([
      "combinedRatio",
      "lossRatio",
      "regulatoryCapitalRatio",
      "reserveDevelopment",
    ]));
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

  it("uses a property-company model instead of industrial FCF and ROIC for non-REIT real estate", () => {
    const result = asArchetype("property_company" as AnalysisArchetype, { company: { sector: "realEstate", industry: "Real Estate—Diversified" } });
    expect(result.dcf.status).toBe("inappropriate");
    expect(result.dcf.method).toContain("Book");
    expect(result.scores.dimensions.valuation.contributors?.map((item) => item.label)).toEqual(["P / Book", "P / E", "Earnings yield"]);
    expect(result.scores.dimensions.profitability.contributors?.some((item) => item.label === "ROIC")).toBe(false);
    expect(result.scores.dimensions.cashFlow.contributors?.some((item) => item.label === "Simple FCF margin")).toBe(false);
  });

  it("lets verified REIT FFO/AFFO metrics contribute when specialized coverage exists", () => {
    const result = asArchetype("reit", {
      company: { sector: "realEstate" },
      specialized: {
        kind: "reit",
        fundsFromOperations: specializedMetric(280),
        fundsFromOperationsPerShare: specializedMetric(2.8),
        adjustedFundsFromOperations: { ...specializedMetric(250), companyDefined: true },
        adjustedFundsFromOperationsPerShare: { ...specializedMetric(2.5), companyDefined: true },
        fundsFromOperationsGrowth: specializedMetric(0.08),
        adjustedFundsFromOperationsGrowth: specializedMetric(0.06),
        adjustedFundsFromOperationsPayout: specializedMetric(0.72),
        dividendCoverage: specializedMetric(1.35),
        occupancy: specializedMetric(0.96),
        sameStoreNoiGrowth: specializedMetric(0.04),
        netDebtToEbitdare: specializedMetric(5.2),
        debtMaturities: specializedMetric(null),
        fixedChargeCoverage: specializedMetric(3.1),
        netAssetValue: specializedMetric(null),
      },
    });

    expect(result.scores.dimensions.profitability.contributors?.find((item) => item.label === "FFO margin")?.score).not.toBeNull();
    expect(result.scores.dimensions.earningsQuality.contributors?.find((item) => item.label === "AFFO payout")?.score).not.toBeNull();
    expect(result.scores.specializedCoverage?.overall).toBeGreaterThan(0.7);
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
      epsDiluted: -1 + index * 0.1,
      operatingCashFlow: -25,
      capitalExpenditures: 10,
      stockBasedCompensation: 30,
      sharesDiluted: 100 + index * 15,
    }));
    const result = asArchetype("software_growth", { annualPeriods });
    expect(result.metrics.valuation.priceEarnings).toBeNull();
    const peContributor = result.scores.dimensions.valuation.contributors?.find((item) => item.label === "P/E");
    expect(peContributor?.availability).toBe("not_meaningful");
    const epsCagr = result.scores.dimensions.growth.contributors?.find((item) => item.label === "EPS CAGR 3Y");
    const fcfPerShareCagr = result.scores.dimensions.growth.contributors?.find((item) => item.label === "FCF/share CAGR 3Y");
    expect(epsCagr?.availability).toBe("not_meaningful");
    expect(fcfPerShareCagr?.availability).toBe("not_meaningful");
    expect(result.scores.dimensions.valuation.missingData).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "P/E" }),
    ]));
    expect(result.scores.dimensions.growth.missingData).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "EPS CAGR 3Y" }),
      expect.objectContaining({ field: "FCF/share CAGR 3Y" }),
    ]));
    expect(result.dcf.status).toBe("unavailable");
    expect(["Buy", "Strong Buy"]).not.toContain(result.recommendation.rating);
  });

  it("uses an investment-entity model without industrial FCF or ROIC", () => {
    const result = asArchetype("investment_entity" as AnalysisArchetype, { company: { sector: "financials", industry: "Asset Management" } });
    expect(result.dcf.status).toBe("inappropriate");
    expect(result.scores.dimensions.valuation.contributors?.map((item) => item.label)).toEqual(["P / Book", "P / E", "Earnings yield"]);
    expect(result.scores.dimensions.profitability.contributors?.some((item) => item.label === "ROIC")).toBe(false);
    expect(result.scores.dimensions.cashFlow.plannedWeight).toBe(0);
    expect(result.recommendation.rating).toBe("No Rating");
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
    expect(result.scores.stockBoxScore).toBeNull();
    expect(result.recommendation.rating).toBe("No Rating");
    expect(result.scores.dimensions.valuation.score).toBeNull();
    expect(result.scores.dimensions.financialHealth.contributors?.some((item) => item.label === "Cash runway (years)")).toBe(true);
  });

  it("requires NAV/SOTP for a holding company without leaking industrial metrics", () => {
    const result = asArchetype("holding_company", { company: { sector: "financials" } });
    expect(result.dcf.method).toBe("NAV / SOTP");
    expect(result.dcf.status).toBe("inappropriate");
    expect(result.scores.stockBoxScore).toBeNull();
    expect(result.recommendation.rating).toBe("No Rating");
    expect(result.scores.dimensions.valuation.contributors?.map((item) => item.label)).toEqual(["NAV / SOTP"]);
    expect(result.scores.dimensions.profitability.contributors?.some((item) => item.label === "ROIC")).toBe(false);
    expect(result.scores.dimensions.cashFlow.plannedWeight).toBe(0);
    expect(result.scores.dimensions.earningsQuality.plannedWeight).toBe(0);
  });

  it("uses a financial-intermediary model without industrial FCF or ROIC", () => {
    const result = asArchetype("financial_intermediary" as AnalysisArchetype, { company: { sector: "financials" } });
    expect(result.dcf.status).toBe("inappropriate");
    expect(result.dcf.method).toContain("Equity");
    expect(result.scores.dimensions.cashFlow.plannedWeight).toBe(0);
    expect(result.scores.dimensions.quality.contributors?.some((item) => item.label === "ROIC")).toBe(false);
    expect(result.scores.dimensions.valuation.contributors?.map((item) => item.label)).toEqual(["P / Book", "P / E", "Earnings yield"]);
    expect(result.recommendation.rating).toBe("No Rating");
  });

  it("allows a utility FCFF route while retaining utility thresholds", () => {
    const result = asArchetype("utility", {
      company: { sector: "utilities" }, analysisDate: "2026-08-25T00:00:00.000Z",
      market: { ...durableCompounderInput.market, currency: "USD", priceDate: "2026-08-24", marketCapAsOf: "2026-08-24", sharesOutstandingAsOf: "2026-08-24" },
    });
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

  it("does not reintroduce corporate FCF payout for a dividend-profile bank", () => {
    const result = asArchetype("bank", {
      company: { sector: "financials", investmentProfile: "dividend" },
    });

    const cashFlowLabels = result.scores.dimensions.cashFlow.contributors?.map((item) => item.label) ?? [];
    expect(cashFlowLabels).not.toContain("FCF payout ratio");
    expect(cashFlowLabels).toContain("Corporate FCF");
    expect(result.scores.dimensions.cashFlow.plannedWeight).toBe(0);
  });

  it("uses REIT cash generation instead of corporate FCF payout for dividend-profile REITs", () => {
    const result = asArchetype("reit", {
      company: { sector: "realEstate", investmentProfile: "dividend" },
      specialized: {
        kind: "reit",
        fundsFromOperations: specializedMetric(280),
        fundsFromOperationsPerShare: specializedMetric(2.8),
        adjustedFundsFromOperations: { ...specializedMetric(250), companyDefined: true },
        adjustedFundsFromOperationsPerShare: { ...specializedMetric(2.5), companyDefined: true },
        fundsFromOperationsGrowth: specializedMetric(0.08),
        adjustedFundsFromOperationsGrowth: specializedMetric(0.06),
        adjustedFundsFromOperationsPayout: specializedMetric(0.72),
        dividendCoverage: specializedMetric(1.35),
        occupancy: specializedMetric(0.96),
        sameStoreNoiGrowth: specializedMetric(0.04),
        netDebtToEbitdare: specializedMetric(5.2),
        debtMaturities: specializedMetric(null),
        fixedChargeCoverage: specializedMetric(3.1),
        netAssetValue: specializedMetric(null),
      },
    });

    const cashFlowLabels = result.scores.dimensions.cashFlow.contributors?.map((item) => item.label) ?? [];
    expect(cashFlowLabels).not.toContain("FCF payout ratio");
    expect(cashFlowLabels).not.toContain("FCF / net income");
    expect(cashFlowLabels).toEqual(expect.arrayContaining(["AFFO payout", "Dividend coverage"]));
  });
});


describe("archetype coverage fairness", () => {
  it("counts missing relevant bank metrics against financial-health coverage", () => {
    const result = asArchetype("bank", { company: { sector: "financials" } });
    expect(result.scores.dimensions.financialHealth.coverage).toBeLessThan(0.5);
    expect(result.scores.specializedCoverage?.overall).toBe(0);
    expect(result.recommendation.rating).toBe("No Rating");
  });

  it("raises bank specialized coverage only for actual reported regulatory and operating metrics", () => {
    const result = asArchetype("bank", {
      company: { sector: "financials" },
      specialized: {
        kind: "bank",
        netInterestIncome: specializedMetric(80),
        netInterestMargin: specializedMetric(0.032),
        grossLoans: specializedMetric(1_000),
        deposits: specializedMetric(1_150),
        depositGrowth: specializedMetric(0.06),
        fundingCost: specializedMetric(0.018),
        cet1CapitalRatio: specializedMetric(0.14),
        tangibleCommonEquity: specializedMetric(180),
        tangibleBookValuePerShare: specializedMetric(18),
        nonPerformingLoans: specializedMetric(12),
        netChargeOffs: specializedMetric(4),
        loanLossProvisions: specializedMetric(6),
        efficiencyRatio: specializedMetric(0.52),
        returnOnAssets: specializedMetric(0.014),
        returnOnEquity: specializedMetric(0.16),
        returnOnTangibleCommonEquity: specializedMetric(0.18),
      },
    });

    expect(result.scores.specializedCoverage?.overall).toBe(1);
    expect(result.scores.dimensions.financialHealth.coverage).toBe(1);
    expect(result.scores.dimensions.profitability.coverage).toBe(1);
  });

  it("models insurer coverage independently from bank metrics", () => {
    const result = asArchetype("insurer", {
      company: { sector: "financials", industry: "Property and casualty insurance" },
      specialized: {
        kind: "insurer",
        premiumGrowth: specializedMetric(0.08),
        combinedRatio: specializedMetric(0.92),
        lossRatio: specializedMetric(0.61),
        expenseRatio: specializedMetric(0.31),
        bookValue: specializedMetric(500),
        tangibleBookValue: specializedMetric(450),
        returnOnEquity: specializedMetric(0.15),
        regulatoryCapitalRatio: specializedMetric(1.8),
        reserveDevelopment: specializedMetric(0.01),
      },
    });

    expect(result.scores.specializedCoverage?.overall).toBe(1);
    expect(result.scores.dimensions.profitability.contributors?.map((item) => item.label)).toEqual(expect.arrayContaining([
      "Combined ratio",
      "Loss ratio",
      "Expense ratio",
    ]));
    expect(result.scores.dimensions.financialHealth.contributors?.map((item) => item.label)).toEqual(expect.arrayContaining([
      "Regulatory capital ratio",
      "Reserve development",
    ]));
  });

  it("does not require P&C underwriting ratios for a life insurer", () => {
    const result = asArchetype("insurer", {
      company: { sector: "financials", industry: "Life Insurance" },
      specialized: {
        kind: "insurer",
        premiumGrowth: specializedMetric(0.05),
        combinedRatio: specializedMetric(null),
        lossRatio: specializedMetric(null),
        expenseRatio: specializedMetric(null),
        bookValue: specializedMetric(500),
        tangibleBookValue: specializedMetric(440),
        returnOnEquity: specializedMetric(0.14),
        regulatoryCapitalRatio: specializedMetric(1.7),
        reserveDevelopment: specializedMetric(null),
      },
    });

    expect(result.scores.specializedCoverage?.missing).not.toEqual(expect.arrayContaining([
      "combinedRatio",
      "lossRatio",
      "expenseRatio",
      "reserveDevelopment",
    ]));
    expect(result.missingData.map((item) => item.field)).not.toEqual(expect.arrayContaining([
      "combinedRatio",
      "lossRatio",
      "expenseRatio",
      "reserveDevelopment",
    ]));
    expect(result.scores.specializedCoverage?.overall).toBe(1);
  });

  it("does not require P&C underwriting ratios for a reinsurer", () => {
    const result = asArchetype("insurer", {
      company: { sector: "financials", industry: "Reinsurance" },
      specialized: {
        kind: "insurer",
        premiumGrowth: specializedMetric(0.04),
        combinedRatio: specializedMetric(null),
        lossRatio: specializedMetric(null),
        expenseRatio: specializedMetric(null),
        bookValue: specializedMetric(700),
        tangibleBookValue: specializedMetric(620),
        returnOnEquity: specializedMetric(0.12),
        regulatoryCapitalRatio: specializedMetric(1.9),
        reserveDevelopment: specializedMetric(null),
      },
    });

    expect(result.scores.specializedCoverage?.missing).not.toEqual(expect.arrayContaining([
      "combinedRatio",
      "lossRatio",
      "expenseRatio",
      "reserveDevelopment",
    ]));
    expect(result.missingData.map((item) => item.field)).not.toEqual(expect.arrayContaining([
      "combinedRatio",
      "lossRatio",
      "expenseRatio",
      "reserveDevelopment",
    ]));
    expect(result.scores.dimensions.profitability.contributors?.map((item) => item.label)).toEqual([
      "Premium growth",
      "Return on equity",
    ]);
  });

  it("returns No Rating and null canonical score for an unknown archetype", () => {
    const result = asArchetype("unknown", { company: { sector: "other", industry: "Unclassified activities" } });

    expect(result.scores.stockBoxScore).toBeNull();
    expect(result.scores.personalizedScore).toBeNull();
    expect(result.recommendation.rating).toBe("No Rating");
  });

  it("does not count fully inapplicable dimensions against overall coverage", () => {
    const result = asArchetype("bank", { company: { sector: "financials" } });
    const applicable = Object.values(result.scores.dimensions).filter((dimension) => (dimension.plannedWeight ?? 0) > 0);
    const applicableWeight = applicable.reduce((sum, dimension) => sum + dimension.weight, 0);
    const expectedCoverage = applicable.reduce((sum, dimension) => sum + (dimension.coverage ?? 0) * dimension.weight, 0) / applicableWeight;
    expect(result.scores.dimensions.cashFlow.plannedWeight).toBe(0);
    expect(result.scores.dataCoverage).toBeCloseTo(expectedCoverage, 10);
  });
});

it("does not leak industrial scoring contributors into specialized archetypes", () => {
  const prohibitedByArchetype: Array<[AnalysisArchetype, Partial<Record<string, string[]>>, Partial<FinancialAnalysisInput>]> = [
    ["bank", {
      growth: ["FCF/share CAGR 3Y"], earningsQuality: ["CFO / net income", "Accrual ratio", "FCF stability"],
      quality: ["ROIC"], risk: ["Interest coverage"],
    }, { company: { sector: "financials" } }],
    ["insurer", {
      earningsQuality: ["CFO / net income", "Accrual ratio", "FCF stability"], quality: ["ROIC"], risk: ["Interest coverage"],
    }, { company: { sector: "financials", industry: "Life Insurance" } }],
    ["reit", {
      quality: ["ROIC", "ROA"], risk: ["Interest coverage"],
    }, { company: { sector: "realEstate", industry: "Real Estate Investment Trust" } }],
  ];

  for (const [archetype, prohibited, overrides] of prohibitedByArchetype) {
    const result = asArchetype(archetype, overrides);
    for (const [dimensionKey, labels] of Object.entries(prohibited)) {
      const actual = result.scores.dimensions[dimensionKey as keyof typeof result.scores.dimensions].contributors?.map((item) => item.label) ?? [];
      for (const label of labels ?? []) expect(actual).not.toContain(label);
    }
  }
});

it("fails closed for an insurer whose subtype cannot be established", () => {
  const result = asArchetype("insurer", {
    company: { sector: "financials", industry: "Insurance Carrier" },
    specialized: {
      kind: "insurer",
      premiumGrowth: specializedMetric(0.05), combinedRatio: specializedMetric(null),
      lossRatio: specializedMetric(null), expenseRatio: specializedMetric(null),
      bookValue: specializedMetric(500), tangibleBookValue: specializedMetric(450),
      returnOnEquity: specializedMetric(0.14), regulatoryCapitalRatio: specializedMetric(1.7),
      reserveDevelopment: specializedMetric(null),
    },
  });

  expect(result.scores.specializedCoverage?.insurerSubtype).toBe("unknown");
  expect(result.recommendation.rating).toBe("No Rating");
  expect(result.recommendation.constraintsApplied).toEqual(expect.arrayContaining([
    expect.stringContaining("subtype"),
  ]));
});
