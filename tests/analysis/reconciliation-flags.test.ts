import { describe, expect, it } from "vitest";
import {
  computeFinancialMetrics,
  detectArchetypeGreenFlags,
  detectFinancialRedFlags,
  reconcileFinancialData,
  type SpecializedCompanyData,
} from "../../src/lib/analysis";
import { durableCompounderInput } from "./fixtures";

const specializedMetric = (value: number | null) => ({ value, dataAsOf: "2026-06-30" });

describe("canonical reconciliation safety", () => {
  it("does not reconcile market cap with diluted weighted-average shares", () => {
    const input = {
      ...durableCompounderInput,
      annualPeriods: durableCompounderInput.annualPeriods.map((period) => ({
        ...period,
        currentSharesOutstanding: null,
      })),
      market: { ...durableCompounderInput.market, sharesOutstanding: null },
    };
    const checks = reconcileFinancialData(input, computeFinancialMetrics(input));

    expect(checks.find((check) => check.code === "market_cap")?.status).toBe("unavailable");
  });

  it("reconciles assets against liabilities, parent equity and reported minority interest", () => {
    const input = {
      ...durableCompounderInput,
      annualPeriods: durableCompounderInput.annualPeriods.map((period, index) => index === durableCompounderInput.annualPeriods.length - 1 ? {
        ...period,
        totalAssets: 120,
        totalLiabilities: 70,
        totalEquity: 40,
        minorityInterest: 10,
      } : period),
    };
    const checks = reconcileFinancialData(input, computeFinancialMetrics(input));

    expect(checks.find((check) => check.code === "balance_sheet_equation")?.status).toBe("pass");
  });

  it("reconciles diluted EPS against diluted income available to common shareholders", () => {
    const input = {
      ...durableCompounderInput,
      annualPeriods: durableCompounderInput.annualPeriods.map((period, index) => index === durableCompounderInput.annualPeriods.length - 1 ? {
        ...period,
        epsDiluted: 2,
        sharesDiluted: 50,
        netIncome: 120,
        dilutedNetIncomeAvailableToCommon: 100,
      } : period),
    };
    const checks = reconcileFinancialData(input, computeFinancialMetrics(input));

    expect(checks.find((check) => check.code === "eps_net_income")?.status).toBe("pass");
  });

  it("reports stale market cap and current-share inputs explicitly", () => {
    const input = {
      ...durableCompounderInput,
      analysisDate: "2026-08-25T00:00:00.000Z",
      market: {
        ...durableCompounderInput.market,
        priceDate: "2026-08-24",
        marketCapAsOf: "2026-06-01",
        sharesOutstandingAsOf: "2025-12-31",
      },
    };
    const checks = reconcileFinancialData(input, computeFinancialMetrics(input));

    expect(checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "market_cap_freshness", status: "warning" }),
      expect.objectContaining({ code: "shares_outstanding_freshness", status: "warning" }),
    ]));
  });

  it("does not flag a stale reported market cap when valuation safely derives a fresh cap from current price and shares", () => {
    const input = {
      ...durableCompounderInput,
      analysisDate: "2026-08-25T00:00:00.000Z",
      market: {
        ...durableCompounderInput.market,
        price: 30,
        priceDate: "2026-08-24",
        sharesOutstanding: 102,
        sharesOutstandingAsOf: "2026-08-24",
        marketCap: 9_999,
        marketCapAsOf: "2026-06-01",
      },
    };
    const metrics = computeFinancialMetrics(input);
    const checks = reconcileFinancialData(input, metrics);

    expect(metrics.valuation.marketCap).toBe(3_060);
    expect(checks.find((check) => check.code === "market_cap")?.status).toBe("pass");
    expect(checks.find((check) => check.code === "market_cap_freshness")?.status).toBe("pass");
  });

  it("treats unknown reporting currency as a reconciliation warning", () => {
    const input = {
      ...durableCompounderInput,
      company: { ...durableCompounderInput.company, currency: undefined, reportingCurrency: undefined },
      annualPeriods: durableCompounderInput.annualPeriods.map((period) => ({ ...period, currency: undefined })),
      market: { ...durableCompounderInput.market, currency: "USD" },
    };
    const checks = reconcileFinancialData(input, computeFinancialMetrics(input));

    expect(checks.find((check) => check.code === "currency_alignment")).toEqual(expect.objectContaining({
      status: "warning",
      message: expect.stringContaining("unknown"),
    }));
  });

  it("treats missing prior-year instant balances as unavailable rather than a reconciliation failure", () => {
    const latest = durableCompounderInput.annualPeriods.at(-1)!;
    const input = {
      ...durableCompounderInput,
      trailingTwelveMonths: {
        ...latest,
        periodEndDate: "2026-06-30",
        form: "TTM" as const,
        periodBasis: "TTM_REPORTED" as const,
        balanceSheetDate: "2026-06-30",
      },
      priorTrailingTwelveMonths: undefined,
    };
    const checks = reconcileFinancialData(input, computeFinancialMetrics(input));

    expect(checks.find((check) => check.code === "return_metric_balance_alignment")?.status).toBe("unavailable");
  });

  it("surfaces provider conflicts and ambiguous archetype classification", () => {
    const input = {
      ...durableCompounderInput,
      company: {
        ...durableCompounderInput.company,
        classificationDiagnostics: {
          reason: "Conflicting evidence.",
          source: "fallback" as const,
          confidence: 0.3,
          ambiguous: true,
          candidates: ["standard" as const, "holding_company" as const],
        },
      },
      sourceConflicts: [{
        metric: "revenue",
        periodEnd: "2024-12-31",
        primaryProvider: "SEC",
        secondaryProvider: "Yahoo",
        severity: "high" as const,
        reason: "Material same-period difference.",
      }],
    };
    const checks = reconcileFinancialData(input, computeFinancialMetrics(input));

    expect(checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "provider_source_conflict", status: "warning" }),
      expect.objectContaining({ code: "archetype_classification", status: "warning" }),
    ]));
  });
});

describe("archetype-aware financial red flags", () => {
  const metrics = computeFinancialMetrics(durableCompounderInput);

  it("does not apply corporate leverage flags to a bank", () => {
    const leveraged = {
      ...metrics,
      ratios: { ...metrics.ratios, netDebtToEbitda: 12, interestCoverage: 0.5 },
    };

    expect(detectFinancialRedFlags(leveraged, "bank").map((flag) => flag.code)).not.toEqual(
      expect.arrayContaining(["high_leverage", "low_interest_coverage"]),
    );
  });

  it("flags weak reported bank capital and asset quality", () => {
    const specialized: SpecializedCompanyData = {
      kind: "bank",
      netInterestIncome: specializedMetric(10), netInterestMargin: specializedMetric(0.01),
      grossLoans: specializedMetric(100), deposits: specializedMetric(70), depositGrowth: specializedMetric(-0.1),
      fundingCost: specializedMetric(0.05), cet1CapitalRatio: specializedMetric(0.06),
      tangibleCommonEquity: specializedMetric(8), tangibleBookValuePerShare: specializedMetric(1),
      nonPerformingLoans: specializedMetric(8), netChargeOffs: specializedMetric(3),
      loanLossProvisions: specializedMetric(4), efficiencyRatio: specializedMetric(0.8),
      returnOnAssets: specializedMetric(-0.01), returnOnEquity: specializedMetric(-0.1),
      returnOnTangibleCommonEquity: specializedMetric(-0.1),
    };

    expect(detectFinancialRedFlags(metrics, "bank", specialized).map((flag) => flag.code)).toEqual(
      expect.arrayContaining(["weak_cet1_capital", "high_nonperforming_loans", "weak_bank_efficiency"]),
    );
  });

  it("flags weak reported insurer underwriting and capital", () => {
    const specialized: SpecializedCompanyData = {
      kind: "insurer",
      premiumGrowth: specializedMetric(-0.05), combinedRatio: specializedMetric(1.08),
      lossRatio: specializedMetric(0.8), expenseRatio: specializedMetric(0.4),
      bookValue: specializedMetric(100), tangibleBookValue: specializedMetric(90),
      returnOnEquity: specializedMetric(0.02), regulatoryCapitalRatio: specializedMetric(0.8),
      reserveDevelopment: specializedMetric(0.1),
    };

    expect(detectFinancialRedFlags(
      metrics,
      "insurer",
      specialized,
      { industry: "Property and casualty insurance" },
    ).map((flag) => flag.code)).toEqual(
      expect.arrayContaining(["underwriting_loss", "weak_insurer_capital", "adverse_reserve_development"]),
    );
  });

  it("flags weak reported REIT leverage and fixed-charge coverage", () => {
    const specialized: SpecializedCompanyData = {
      kind: "reit",
      fundsFromOperations: specializedMetric(100), fundsFromOperationsPerShare: specializedMetric(1),
      adjustedFundsFromOperations: { ...specializedMetric(90), companyDefined: true },
      adjustedFundsFromOperationsPerShare: { ...specializedMetric(0.9), companyDefined: true },
      fundsFromOperationsGrowth: specializedMetric(-0.05), adjustedFundsFromOperationsGrowth: specializedMetric(-0.08),
      adjustedFundsFromOperationsPayout: specializedMetric(1.1), dividendCoverage: specializedMetric(0.8),
      occupancy: specializedMetric(0.75), sameStoreNoiGrowth: specializedMetric(-0.04),
      netDebtToEbitdare: specializedMetric(9), debtMaturities: specializedMetric(null),
      fixedChargeCoverage: specializedMetric(1), netAssetValue: specializedMetric(null),
    };

    expect(detectFinancialRedFlags(metrics, "reit", specialized).map((flag) => flag.code)).toEqual(
      expect.arrayContaining(["high_reit_leverage", "weak_fixed_charge_coverage", "low_occupancy"]),
    );
  });
});


describe("archetype-aware flag purity", () => {
  const financial = computeFinancialMetrics(durableCompounderInput);
  const legacyMetrics = {
    revenueGrowth1y: 0.2, revenueCagr3y: 0.18, epsGrowth1y: 0.15,
    grossMargin: 0.6, operatingMargin: 0.3, netMargin: 0.2,
    fcf: 120, fcfMargin: 0.2, cashConversion: 1.1,
    debtToEquity: 0.2, debtToAssets: 0.15, netDebt: 50,
    interestCoverage: 12, currentRatio: 2, netDebtToEbitda: 0.5,
    returnOnEquity: 0.18, returnOnAssets: 0.12, returnOnInvestedCapital: 0.16,
    priceEarnings: 20, priceSales: 4, priceBook: 3, evEbitda: 14, evSales: 4, peg: 1.5,
    earningsYield: 0.05, fcfYield: 0.06,
    priceMomentum1y: 0.1, priceMomentum3m: 0.05,
  };

  it("does not emit corporate green flags for an insurer", () => {
    const specialized: SpecializedCompanyData = {
      kind: "insurer",
      premiumGrowth: specializedMetric(0.06), combinedRatio: specializedMetric(null),
      lossRatio: specializedMetric(null), expenseRatio: specializedMetric(null),
      bookValue: specializedMetric(500), tangibleBookValue: specializedMetric(450),
      returnOnEquity: specializedMetric(0.14), regulatoryCapitalRatio: specializedMetric(1.7),
      reserveDevelopment: specializedMetric(null),
    };
    const labels = detectArchetypeGreenFlags(legacyMetrics, financial, "insurer", specialized, { industry: "Life Insurance" })
      .map((flag) => flag.title);
    expect(labels).not.toEqual(expect.arrayContaining([
      "Durable revenue growth", "Strong operating margin", "Strong free cash flow margin", "Conservative leverage",
    ]));
  });
  it("does not apply P&C underwriting flags to a life insurer", () => {
    const specialized: SpecializedCompanyData = {
      kind: "insurer",
      premiumGrowth: specializedMetric(0.02), combinedRatio: specializedMetric(1.2),
      lossRatio: specializedMetric(0.9), expenseRatio: specializedMetric(0.5),
      bookValue: specializedMetric(500), tangibleBookValue: specializedMetric(450),
      returnOnEquity: specializedMetric(0.08), regulatoryCapitalRatio: specializedMetric(1.5),
      reserveDevelopment: specializedMetric(0.2),
    };
    const codes = detectFinancialRedFlags(financial, "insurer", specialized, { industry: "Life Insurance" })
      .map((flag) => flag.code);
    expect(codes).not.toEqual(expect.arrayContaining(["underwriting_loss", "adverse_reserve_development"]));
  });

  it.each(["pre_revenue_biotech", "holding_company"] as const)(
    "does not apply generic operating-company red flags to %s",
    (archetype) => {
      const stressed = {
        ...financial,
        growth: { ...financial.growth, revenueGrowthYoY: -0.5 },
        margins: { ...financial.margins, freeCashFlowMargin: -0.3 },
        ratios: { ...financial.ratios, netDebtToEbitda: 12, interestCoverage: 0.4, cashConversion: 0.2 },
        cashFlow: { ...financial.cashFlow, accrualRatio: 0.3 },
        trends: { ...financial.trends, operatingMarginChangeYoY: -0.1 },
      };
      const codes = detectFinancialRedFlags(stressed, archetype).map((flag) => flag.code);
      expect(codes).not.toEqual(expect.arrayContaining([
        "revenue_contraction", "negative_fcf_margin", "high_leverage", "low_interest_coverage",
        "weak_cash_conversion", "large_accrual_gap", "margin_compression",
      ]));
    },
  );
});

it("reconciles minor-unit quote prices against economic-currency market cap", () => {
  const input = {
    ...durableCompounderInput,
    company: { ...durableCompounderInput.company, currency: "GBP", reportingCurrency: "GBP", tradingCurrency: "GBp" },
    annualPeriods: durableCompounderInput.annualPeriods.map((period) => ({ ...period, currency: "GBP" })),
    market: {
      ...durableCompounderInput.market,
      price: 1500, currency: "GBp", marketCap: 1500,
      marketCapCurrency: "GBP", sharesOutstanding: 100,
    },
  };
  const checks = reconcileFinancialData(input, computeFinancialMetrics(input));
  expect(checks.find((check) => check.code === "market_cap")?.status).toBe("pass");
  expect(computeFinancialMetrics(input).valuation.marketCap).toBe(1500);
});
