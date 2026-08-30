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

  it("uses a property-company model for non-REIT real-estate operators", () => {
    const result = asArchetype("property_company", {
      company: { sector: "realEstate", industry: "Real Estate Services" },
      market: { ...durableCompounderInput.market, priceDate: "2026-08-24", marketCapAsOf: "2026-08-24" },
      analysisDate: "2026-08-25T00:00:00.000Z",
    });

    expect(result.dcf.status).toBe("inappropriate");
    expect(result.dcf.method).toBe("NAV / property earnings");
    expect(result.scores.stockBoxScore).toEqual(expect.any(Number));
    expect(result.recommendation.rating).not.toBe("No Rating");
    expect(result.scores.dimensions.valuation.contributors?.map((item) => item.label)).toEqual([
      "P / Book",
      "EV / EBITDA",
      "EV / Sales",
    ]);
    expect(result.scores.dimensions.quality.contributors?.map((item) => item.label)).not.toContain("ROIC");
    expect(result.missingData.map((item) => item.field)).not.toContain("Archetype-specific valuation model");
  });

  it("uses an asset-manager model for fee-based financial operators", () => {
    const result = asArchetype("asset_manager", {
      company: { sector: "financials", industry: "Asset Management" },
      market: { ...durableCompounderInput.market, priceDate: "2026-08-24", marketCapAsOf: "2026-08-24" },
      analysisDate: "2026-08-25T00:00:00.000Z",
    });

    expect(result.dcf.status).toBe("inappropriate");
    expect(result.dcf.method).toBe("AUM / fee-related earnings");
    expect(result.scores.stockBoxScore).toEqual(expect.any(Number));
    expect(result.recommendation.rating).not.toBe("No Rating");
    expect(result.scores.dimensions.valuation.contributors?.map((item) => item.label)).toEqual([
      "P / E",
      "EV / EBITDA",
      "P / Book",
    ]);
    expect(result.scores.dimensions.quality.contributors?.map((item) => item.label)).not.toContain("ROIC");
    expect(result.missingData.map((item) => item.field)).not.toContain("Archetype-specific valuation model");
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

  it("uses a transparent 3Y fallback when Yahoo-style cyclical history is too short for 5Y CAGR", () => {
    const result = asArchetype("cyclical", { company: { sector: "energy" } });
    const growth = result.scores.dimensions.growth;
    expect(growth.contributors?.map((item) => item.label)).toEqual(["Revenue CAGR 5Y", "Revenue CAGR 3Y fallback", "FCF stability"]);
    expect(growth.contributors?.find((item) => item.label === "Revenue CAGR 5Y")?.availability).toBe("missing");
    expect(growth.contributors?.find((item) => item.label === "Revenue CAGR 3Y fallback")?.availability).toBe("available");
    expect(growth.coverage).toBeCloseTo(0.7, 8);
    expect(growth.score).not.toBeNull();
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

  it("uses holding-company economics and requires real NAV/SOTP evidence for a rating", () => {
    const result = asArchetype("holding_company", { company: { sector: "financials" } });
    expect(result.dcf.method).toBe("NAV / SOTP");
    expect(result.scores.stockBoxScore).toBeNull();
    expect(result.recommendation.rating).toBe("No Rating");
    expect(result.scores.dimensions.growth.contributors?.map((item) => item.label)).toEqual(["NAV / share growth"]);
    expect(result.scores.dimensions.financialHealth.contributors?.map((item) => item.label)).toEqual(["Net debt / equity", "Cash / debt", "Equity / assets"]);
    expect(result.scores.dimensions.financialHealth.score).not.toBeNull();
    expect(result.scores.dimensions.profitability.plannedWeight).toBe(0);
    expect(result.scores.dimensions.cashFlow.plannedWeight).toBe(0);
    expect(result.scores.dimensions.earningsQuality.plannedWeight).toBe(0);
    expect(result.scores.dimensions.quality.contributors?.map((item) => item.label)).toEqual(["NAV / share compounding", "Equity / assets", "Share dilution"]);
    expect(result.scores.dimensions.valuation.contributors?.map((item) => item.label)).toEqual(["NAV discount / premium"]);
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

  it("keeps partial bank specialist objects as missing data instead of crashing", () => {
    const result = asArchetype("bank", {
      company: { sector: "financials" },
      specialized: {
        kind: "bank",
        netInterestIncome: specializedMetric(80),
        netInterestMargin: specializedMetric(0.032),
        grossLoans: specializedMetric(1_000),
        deposits: specializedMetric(1_150),
        depositGrowth: specializedMetric(0.06),
      } as never,
    });

    expect(result.scores.specializedCoverage?.overall).toBeGreaterThan(0);
    expect(result.scores.specializedCoverage?.overall).toBeLessThan(1);
    expect(result.scores.specializedCoverage?.missing).toEqual(expect.arrayContaining([
      "netInterestIncomeGrowth",
      "grossLoanGrowth",
      "cet1CapitalRatio",
    ]));
    expect(result.scores.dimensions.growth.coverage).toBeCloseTo(0.4, 5);
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
        netInterestIncomeGrowth: specializedMetric(0.05),
        grossLoanGrowth: specializedMetric(0.04),
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

  it("does not count unused bank fields as required specialist coverage", () => {
    const result = asArchetype("bank", { company: { sector: "financials" } });

    expect(result.scores.specializedCoverage?.required).not.toContain("fundingCost");
    expect(result.scores.specializedCoverage?.missing).not.toContain("fundingCost");
  });

  it("does not duplicate direct bank specialist gaps in the top-level missing-data summary", () => {
    const result = asArchetype("bank", { company: { sector: "financials" } });
    const topLevelFields = result.missingData.map((item) => item.field);

    expect(topLevelFields).toEqual(expect.arrayContaining([
      "netInterestMargin",
      "cet1CapitalRatio",
      "grossLoans",
      "nonperformingLoans",
      "netChargeOffs",
    ]));
    expect(topLevelFields).not.toContain("Net interest margin");
    expect(topLevelFields).not.toContain("CET1 capital ratio");
    expect(topLevelFields).not.toContain("Nonperforming loans / gross loans");
    expect(topLevelFields).not.toContain("Net charge-offs / gross loans");
    expect(result.scores.dimensions.profitability.missingData?.map((item) => item.field)).toContain("Net interest margin");
    expect(result.scores.dimensions.financialHealth.missingData?.map((item) => item.field)).toContain("CET1 capital ratio");
    expect(result.scores.dimensions.financialHealth.missingData?.map((item) => item.field)).toContain("Nonperforming loans / gross loans");
    expect(result.scores.dimensions.financialHealth.missingData?.map((item) => item.field)).toContain("Net charge-offs / gross loans");
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

  it("does not reuse operating-company score dimensions for unresolved financial specialists", () => {
    const result = asArchetype("unknown", {
      company: {
        sector: "financials",
        industry: "Capital Markets",
        classificationDiagnostics: {
          reason: "Industry description identifies a capital-markets business; a specialized capital-markets model is required before corporate methodology can be used.",
          source: "description",
          confidence: 0.8,
          ambiguous: false,
          candidates: ["unknown"],
        },
      },
    });
    const labels = Object.values(result.scores.dimensions).flatMap((dimension) =>
      dimension.contributors?.map((item) => item.label) ?? []
    );

    expect(labels).not.toEqual(expect.arrayContaining([
      "Gross margin",
      "Operating margin",
      "ROIC",
      "Net debt / EBITDA",
      "EV / EBITDA",
      "FCF / net income",
    ]));
    expect(labels).toEqual(expect.arrayContaining([
      "Archetype-specific growth model",
      "Archetype-specific profitability model",
      "Archetype-specific valuation model",
      "Beta",
    ]));
    expect(result.missingData.map((item) => item.field)).toEqual(expect.arrayContaining([
      "Archetype-specific growth model",
      "Archetype-specific profitability model",
      "Archetype-specific valuation model",
    ]));
  });

  it("diagnoses unresolved archetype contributors as missing specialist model coverage", () => {
    const result = asArchetype("unknown", {
      company: {
        sector: "financials",
        industry: "Capital Markets",
        classificationDiagnostics: {
          reason: "Industry description identifies a capital-markets business; a specialized capital-markets model is required before corporate methodology can be used.",
          source: "description",
          confidence: 0.8,
          ambiguous: false,
          candidates: ["unknown"],
        },
      },
    });

    expect(result.scores.dimensions.valuation.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "Archetype-specific valuation model",
        reason: expect.stringContaining("specialized capital-markets model"),
      }),
    ]));
  });

  it("diagnoses bank ratio contributors by missing specialized inputs", () => {
    const result = asArchetype("bank", { company: { sector: "financials" } });

    expect(result.scores.dimensions.profitability.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "Efficiency ratio",
        reason: expect.stringContaining("net interest income"),
      }),
    ]));
    expect(result.scores.dimensions.earningsQuality.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "Loan-loss provisions / gross loans",
        reason: expect.stringContaining("loan-loss provisions"),
      }),
    ]));
  });

  it("diagnoses non-P&C insurer earnings quality as missing specialist reserve data", () => {
    const result = asArchetype("insurer", {
      company: { sector: "financials", industry: "Life Insurance" },
    });

    expect(result.scores.dimensions.earningsQuality.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "Specialized insurance earnings quality",
        reason: expect.stringContaining("specialist reserve or policy data"),
      }),
    ]));
  });

  it("does not count fully inapplicable dimensions against overall coverage", () => {
    const result = asArchetype("bank", { company: { sector: "financials" } });
    const applicable = Object.values(result.scores.dimensions).filter((dimension) => (dimension.plannedWeight ?? 0) > 0);
    const applicableWeight = applicable.reduce((sum, dimension) => sum + dimension.weight, 0);
    const expectedCoverage = applicable.reduce((sum, dimension) => sum + (dimension.coverage ?? 0) * dimension.weight, 0) / applicableWeight;
    expect(result.scores.dimensions.cashFlow.plannedWeight).toBe(0);
    expect(result.scores.dataCoverage).toBeCloseTo(expectedCoverage, 10);
  });

  it("keeps unsuitable contributors out of global missing-data diagnostics", () => {
    const bank = asArchetype("bank", { company: { sector: "financials" } });
    const insurer = asArchetype("insurer", { company: { sector: "financials", industry: "Life Insurance" } });
    const holdingCompany = asArchetype("holding_company", { company: { sector: "financials" } });

    expect(bank.scores.dimensions.cashFlow.contributors?.find((item) => item.label === "Corporate FCF")?.availability).toBe("unsuitable");
    expect(insurer.scores.dimensions.cashFlow.contributors?.find((item) => item.label === "Corporate FCF")?.availability).toBe("unsuitable");
    expect(holdingCompany.scores.dimensions.profitability.contributors?.find((item) => item.label === "Operating-company profitability")?.availability).toBe("unsuitable");
    expect(holdingCompany.scores.dimensions.cashFlow.contributors?.find((item) => item.label === "Corporate free cash flow")?.availability).toBe("unsuitable");

    expect(bank.missingData.map((item) => item.field)).not.toContain("Corporate FCF");
    expect(insurer.missingData.map((item) => item.field)).not.toContain("Corporate FCF");
    expect(holdingCompany.missingData.map((item) => item.field)).not.toEqual(expect.arrayContaining([
      "Operating-company profitability",
      "Corporate free cash flow",
      "Operating accruals",
    ]));
  });

  it("diagnoses non-positive CAGR endpoints separately from missing source data", () => {
    const annualPeriods = durableCompounderInput.annualPeriods.map((period, index) => ({
      ...period,
      epsDiluted: index === 0 ? -0.2 : index === 3 ? 0.5 : period.epsDiluted,
      operatingCashFlow: index === 0 ? -10 : index === 3 ? 320 : period.operatingCashFlow,
      capitalExpenditures: index === 0 ? -20 : period.capitalExpenditures,
    }));
    const result = asArchetype("standard", { annualPeriods });
    const growthMissing = result.scores.dimensions.growth.missingData ?? [];

    expect(growthMissing).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "EPS CAGR 3Y",
        reason: expect.stringContaining("non-positive"),
      }),
      expect.objectContaining({
        field: "FCF/share CAGR 3Y",
        reason: expect.stringContaining("non-positive"),
      }),
    ]));
  });

  it("diagnoses leverage and interest coverage gaps by failed input condition", () => {
    const annualPeriods = durableCompounderInput.annualPeriods.map((period, index) => ({
      ...period,
      ebitda: index === 3 ? -20 : period.ebitda,
      interestExpense: index === 3 ? null : period.interestExpense,
    }));
    const result = asArchetype("standard", { annualPeriods });
    const healthMissing = result.scores.dimensions.financialHealth.missingData ?? [];

    expect(healthMissing).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "Net debt / EBITDA",
        reason: expect.stringContaining("EBITDA is non-positive"),
      }),
      expect.objectContaining({
        field: "Interest coverage",
        reason: expect.stringContaining("Interest expense is missing"),
      }),
    ]));
  });

  it("scores positive operating income with reported zero interest expense as strong coverage", () => {
    const annualPeriods = durableCompounderInput.annualPeriods.map((period, index) => ({
      ...period,
      interestExpense: index === 3 ? 0 : period.interestExpense,
    }));
    const result = asArchetype("standard", { annualPeriods, trailingTwelveMonths: undefined });
    const health = result.scores.dimensions.financialHealth;
    const risk = result.scores.dimensions.risk;

    expect(result.metrics.ratios.interestCoverage).toBeGreaterThanOrEqual(8);
    expect(health.contributors?.find((item) => item.label === "Interest coverage")).toMatchObject({
      availability: "available",
      score: 100,
    });
    expect(risk.contributors?.find((item) => item.label === "Interest coverage")).toMatchObject({
      availability: "available",
      score: 100,
    });
    expect(result.missingData).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "Interest coverage" }),
    ]));
  });

  it("diagnoses non-positive prior FCF separately from missing annual FCF growth data", () => {
    const annualPeriods = durableCompounderInput.annualPeriods.map((period, index) => ({
      ...period,
      operatingCashFlow: index === 2 ? -10 : index === 3 ? 320 : period.operatingCashFlow,
      capitalExpenditures: index === 2 ? -20 : period.capitalExpenditures,
    }));
    const result = asArchetype("standard", { annualPeriods });
    const cashFlowMissing = result.scores.dimensions.cashFlow.missingData ?? [];

    expect(cashFlowMissing).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "FCF growth annual YoY",
        reason: expect.stringContaining("prior-year FCF is non-positive"),
      }),
    ]));
  });

  it("diagnoses valuation multiple gaps by failed input condition", () => {
    const annualPeriods = durableCompounderInput.annualPeriods.map((period, index) => index === 3 ? {
      ...period,
      ebitda: -20,
      netIncome: -15,
      netIncomeCommonStockholders: -15,
    } : period);
    const result = asArchetype("standard", {
      annualPeriods,
      company: { reportingCurrency: "USD", tradingCurrency: "USD" },
      market: {
        ...durableCompounderInput.market,
        currency: "USD",
        priceDate: "2026-08-24",
        marketCapAsOf: "2026-08-24",
        marketCapCurrency: "USD",
        sharesOutstandingAsOf: "2026-08-24",
      },
    });
    const valuationMissing = result.scores.dimensions.valuation.missingData ?? [];

    expect(valuationMissing).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "P/E",
        reason: expect.stringContaining("common earnings are non-positive"),
      }),
      expect.objectContaining({
        field: "EV / EBITDA",
        reason: expect.stringContaining("EBITDA is non-positive"),
      }),
    ]));
  });

  it("diagnoses ROIC gaps by missing return-period operating income", () => {
    const annualPeriods = durableCompounderInput.annualPeriods.map((period, index) => index === 3 ? {
      ...period,
      operatingIncome: null,
    } : period);
    const result = asArchetype("standard", { annualPeriods });
    const profitabilityMissing = result.scores.dimensions.profitability.missingData ?? [];

    expect(profitabilityMissing).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "ROIC",
        reason: expect.stringContaining("operating income"),
      }),
    ]));
  });

  it("diagnoses revenue-based margin contributors by missing revenue", () => {
    const annualPeriods = durableCompounderInput.annualPeriods.map((period, index) => index === 3 ? {
      ...period,
      revenue: null,
    } : period);
    const result = asArchetype("standard", { annualPeriods });
    const profitabilityMissing = result.scores.dimensions.profitability.missingData ?? [];

    expect(profitabilityMissing).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "Gross margin",
        reason: expect.stringContaining("reported revenue"),
      }),
      expect.objectContaining({
        field: "Operating margin",
        reason: expect.stringContaining("reported revenue"),
      }),
      expect.objectContaining({
        field: "Net margin",
        reason: expect.stringContaining("reported revenue"),
      }),
    ]));
  });

  it("diagnoses FCF yield by missing simple free-cash-flow inputs", () => {
    const annualPeriods = durableCompounderInput.annualPeriods.map((period, index) => index === 3 ? {
      ...period,
      operatingCashFlow: null,
      capitalExpenditures: null,
      freeCashFlow: null,
    } : period);
    const result = asArchetype("standard", {
      annualPeriods,
      company: { reportingCurrency: "USD", tradingCurrency: "USD" },
      market: {
        ...durableCompounderInput.market,
        currency: "USD",
        priceDate: "2026-08-24",
        marketCapAsOf: "2026-08-24",
        marketCapCurrency: "USD",
        sharesOutstandingAsOf: "2026-08-24",
      },
    });
    const valuationMissing = result.scores.dimensions.valuation.missingData ?? [];

    expect(valuationMissing).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "FCF yield",
        reason: expect.stringContaining("operating cash flow and capex"),
      }),
    ]));
  });

  it("diagnoses revenue CAGR and stability gaps by insufficient annual history", () => {
    const annualPeriods = durableCompounderInput.annualPeriods.slice(-2);
    const result = asArchetype("standard", { annualPeriods });

    expect(result.scores.dimensions.growth.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "Revenue CAGR 3Y",
        reason: expect.stringContaining("three-year-prior"),
      }),
    ]));
    expect(result.scores.dimensions.quality.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "Gross margin stability",
        reason: expect.stringContaining("three contiguous annual periods"),
      }),
    ]));
  });

  it("diagnoses share dilution gaps by missing comparable share counts", () => {
    const annualPeriods = durableCompounderInput.annualPeriods.map((period, index) => index >= 2 ? {
      ...period,
      sharesDiluted: null,
    } : period);
    const result = asArchetype("standard", { annualPeriods });

    expect(result.scores.dimensions.quality.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "Share dilution",
        reason: expect.stringContaining("diluted share counts"),
      }),
    ]));
  });

  it("diagnoses accrual and ROA gaps by missing balance-sheet inputs", () => {
    const annualPeriods = durableCompounderInput.annualPeriods.map((period) => ({
      ...period,
      totalAssets: null,
    }));
    const result = asArchetype("standard", { annualPeriods });

    expect(result.scores.dimensions.earningsQuality.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "Accrual ratio",
        reason: expect.stringContaining("assets"),
      }),
    ]));
    expect(result.scores.dimensions.quality.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "ROA",
        reason: expect.stringContaining("assets"),
      }),
    ]));
  });

  it("diagnoses market-context gaps by missing market history", () => {
    const result = asArchetype("standard", { market: undefined });

    expect(result.scores.dimensions.momentum.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "Price performance 1Y",
        reason: expect.stringContaining("price history"),
      }),
    ]));
    expect(result.scores.dimensions.risk.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "Beta",
        reason: expect.stringContaining("benchmark"),
      }),
    ]));
  });

  it("diagnoses holding-company NAV gaps as missing look-through NAV data", () => {
    const result = asArchetype("holding_company", { company: { sector: "financials" } });

    expect(result.scores.dimensions.growth.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "NAV / share growth",
        reason: expect.stringContaining("look-through NAV"),
      }),
    ]));
    expect(result.scores.dimensions.valuation.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "NAV discount / premium",
        reason: expect.stringContaining("look-through NAV"),
      }),
    ]));
  });

  it("diagnoses cyclical five-year CAGR gaps by missing comparable history", () => {
    const result = asArchetype("cyclical", { company: { sector: "energy" } });

    expect(result.scores.dimensions.growth.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "Revenue CAGR 5Y",
        reason: expect.stringContaining("five-year-prior"),
      }),
    ]));
  });

  it("diagnoses bank book-value, balance-sheet and specialist-growth gaps", () => {
    const annualPeriods = durableCompounderInput.annualPeriods.map((period) => ({
      ...period,
      totalAssets: null,
      totalEquity: null,
    }));
    const result = asArchetype("bank", {
      company: { sector: "financials" },
      annualPeriods,
      market: undefined,
      specialized: { kind: "bank" } as never,
    });

    expect(result.scores.dimensions.financialHealth.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "Equity / assets",
        reason: expect.stringContaining("reported assets"),
      }),
    ]));
    expect(result.scores.dimensions.valuation.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "P / Book",
        reason: expect.stringContaining("book equity"),
      }),
    ]));
    expect(result.scores.dimensions.growth.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "Deposit growth",
        reason: expect.stringContaining("specialized bank data"),
      }),
    ]));
    expect(result.scores.dimensions.quality.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "Return on tangible common equity",
        reason: expect.stringContaining("tangible common equity"),
      }),
    ]));
  });

  it("diagnoses insurer book-value multiples by missing specialist valuation inputs", () => {
    const missingMarket = asArchetype("insurer", {
      company: { sector: "financials", industry: "Life Insurance" },
      market: undefined,
      specialized: { kind: "insurer" } as never,
    });
    const missingBookValues = asArchetype("insurer", {
      company: { sector: "financials", industry: "Life Insurance", reportingCurrency: "USD", tradingCurrency: "USD" },
      annualPeriods: durableCompounderInput.annualPeriods.map((period) => ({
        ...period,
        totalEquity: null,
        tangibleBookValue: null,
      })),
      market: {
        ...durableCompounderInput.market,
        currency: "USD",
        marketCapAsOf: "2026-08-24",
        marketCapCurrency: "USD",
        priceDate: "2026-08-24",
      },
      specialized: { kind: "insurer" } as never,
    });

    expect(missingBookValues.scores.dimensions.valuation.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "P / Tangible Book",
        reason: expect.stringContaining("tangible book"),
      }),
      expect.objectContaining({
        field: "P / Book",
        reason: expect.stringContaining("book value"),
      }),
    ]));
    expect(missingMarket.scores.dimensions.valuation.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "P / E",
        reason: expect.stringContaining("market cap"),
      }),
    ]));
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
