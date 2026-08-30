import { describe, expect, it } from "vitest";
import { computeFinancialMetrics } from "../../src/lib/analysis";
import { appleFy2025Input, durableCompounderInput, missingDataInput } from "./fixtures";

describe("computeFinancialMetrics", () => {
  it("calculates deterministic margins, growth, ratios and valuation metrics", () => {
    const metrics = computeFinancialMetrics(durableCompounderInput);

    expect(metrics.margins.grossMargin).toBeCloseTo(0.7, 5);
    expect(metrics.margins.operatingMargin).toBeCloseTo(0.26, 5);
    expect(metrics.margins.netMargin).toBeCloseTo(0.2, 5);
    expect(metrics.margins.freeCashFlowMargin).toBeCloseTo(260 / 1200, 5);

    expect(metrics.growth.revenueGrowthYoY).toBeCloseTo(0.2, 5);
    expect(metrics.growth.revenueCagr3y).toBeCloseTo((1200 / 700) ** (1 / 3) - 1, 5);
    expect(metrics.growth.freeCashFlowGrowthYoY).toBeCloseTo((260 / 175) - 1, 5);

    expect(metrics.ratios.currentRatio).toBeCloseTo(470 / 230, 5);
    expect(metrics.ratios.debtToEquity).toBeCloseTo(220 / 620, 5);
    expect(metrics.ratios.netDebt).toBe(40);
    expect(metrics.ratios.netDebtToEbitda).toBeCloseTo(40 / 372, 5);
    expect(metrics.ratios.interestCoverage).toBeCloseTo(312 / 16, 5);
    const currentCapital = 220 + 620 - 180;
    const priorCapital = 200 + 430 - 120;
    expect(metrics.ratios.returnOnInvestedCapital).toBeCloseTo((312 * 0.79) / ((currentCapital + priorCapital) / 2), 5);
    expect(metrics.ratios.cashConversion).toBeCloseTo(260 / 240, 5);

    expect(metrics.valuation.priceEarnings).toBeCloseTo(3060 / 240, 5);
    expect(metrics.valuation.evEbitda).toBeCloseTo(3100 / 372, 5);
    expect(metrics.valuation.freeCashFlowYield).toBeCloseTo(260 / 3060, 5);
  });

  it("uses common-shareholder earnings rather than broader net income for P/E", () => {
    const latest = {
      ...durableCompounderInput.annualPeriods.at(-1)!,
      netIncome: 240,
      netIncomeCommonStockholders: 120,
    };
    const metrics = computeFinancialMetrics({ ...durableCompounderInput, annualPeriods: [latest] });

    expect(metrics.valuation.priceEarnings).toBeCloseTo(3060 / 120, 5);
    expect(metrics.valuation.earningsYield).toBeCloseTo(120 / 3060, 5);
  });

  it("reconciles the Apple FY2025 golden financial statement values", () => {
    const metrics = computeFinancialMetrics(appleFy2025Input);

    expect(metrics.growth.revenueGrowthYoY).toBeCloseTo(0.0643, 3);
    expect(metrics.margins.grossMargin).toBeCloseTo(0.4691, 3);
    expect(metrics.margins.operatingMargin).toBeCloseTo(0.3197, 3);
    expect(metrics.margins.netMargin).toBeCloseTo(0.2692, 3);
    expect(metrics.cashFlow.simpleFreeCashFlow).toBe(98_767_000_000);
    expect(metrics.cashFlow.simpleFreeCashFlow).not.toBeCloseTo(124_197_000_000, -6);
    expect(metrics.cashFlow.freeCashFlowToNetIncome).toBeCloseTo(0.882, 3);
    expect(metrics.latestPeriod?.epsDiluted).toBe(7.46);
  });

  it("subtracts capex exactly once for positive and negative provider signs", () => {
    const positive = computeFinancialMetrics({ ...durableCompounderInput, annualPeriods: [{ ...durableCompounderInput.annualPeriods.at(-1)!, capitalExpenditures: 60 }] });
    const negative = computeFinancialMetrics({ ...durableCompounderInput, annualPeriods: [{ ...durableCompounderInput.annualPeriods.at(-1)!, capitalExpenditures: -60 }] });
    expect(positive.cashFlow.simpleFreeCashFlow).toBe(260);
    expect(negative.cashFlow.simpleFreeCashFlow).toBe(260);
  });

  it("does not assume missing debt is zero for net debt or enterprise value", () => {
    const latest = { ...durableCompounderInput.annualPeriods.at(-1)!, totalDebt: null };
    const input = { ...durableCompounderInput, annualPeriods: [latest], market: { ...durableCompounderInput.market, enterpriseValue: null } };
    const metrics = computeFinancialMetrics(input);
    expect(metrics.ratios.netDebt).toBeNull();
    expect(metrics.valuation.enterpriseValue).toBeNull();
  });

  it("does not use diluted weighted-average shares as a current market-cap denominator", () => {
    const latest = {
      ...durableCompounderInput.annualPeriods.at(-1)!,
      currentSharesOutstanding: null,
      sharesDiluted: 15_000,
    };
    const metrics = computeFinancialMetrics({
      ...durableCompounderInput,
      annualPeriods: [latest],
      market: {
        ...durableCompounderInput.market,
        price: 200,
        marketCap: null,
        sharesOutstanding: null,
      },
    });
    expect(metrics.valuation.marketCap).toBeNull();
  });

  it("refuses valuation metrics when financial and market currencies differ", () => {
    const metrics = computeFinancialMetrics({
      ...durableCompounderInput,
      company: { ...durableCompounderInput.company, currency: "SEK" },
      annualPeriods: durableCompounderInput.annualPeriods.map((period) => ({
        ...period,
        currency: "SEK",
      })),
      market: {
        ...durableCompounderInput.market,
        currency: "USD",
      },
    });

    expect(metrics.valuation).toMatchObject({
      marketCap: null,
      enterpriseValue: null,
      priceEarnings: null,
      priceSales: null,
      freeCashFlowYield: null,
      earningsYield: null,
    });
    expect(metrics.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "currencyAlignment",
        impact: "metric",
        severity: "high",
      }),
    ]));
  });

  it("treats unknown reporting currency as unsafe instead of assuming the trading currency", () => {
    const metrics = computeFinancialMetrics({
      ...durableCompounderInput,
      company: {
        ...durableCompounderInput.company,
        currency: undefined,
      },
      annualPeriods: durableCompounderInput.annualPeriods.map((period) => ({
        ...period,
        currency: undefined,
      })),
      market: {
        ...durableCompounderInput.market,
        currency: "USD",
      },
    });

    expect(metrics.valuation).toMatchObject({
      marketCap: null,
      enterpriseValue: null,
      priceEarnings: null,
      freeCashFlowYield: null,
    });
    expect(metrics.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "currencyAlignment",
        reason: expect.stringContaining("unknown"),
        severity: "high",
      }),
    ]));
  });

  it("allows valuation when explicit reporting and trading currencies align", () => {
    const metrics = computeFinancialMetrics({
      ...durableCompounderInput,
      company: {
        ...durableCompounderInput.company,
        currency: undefined,
        reportingCurrency: "USD",
        tradingCurrency: "USD",
      },
      market: {
        ...durableCompounderInput.market,
        currency: "USD",
      },
    });

    expect(metrics.valuation.marketCap).toBe(3060);
    expect(metrics.valuation.priceEarnings).toBeCloseTo(3060 / 240, 5);
  });

  it("blocks market-based valuation when a current reported market cap materially disagrees with current price times shares", () => {
    const metrics = computeFinancialMetrics({
      ...durableCompounderInput,
      analysisDate: "2026-08-27T00:00:00.000Z",
      company: {
        ...durableCompounderInput.company,
        reportingCurrency: "USD",
        tradingCurrency: "USD",
      },
      annualPeriods: durableCompounderInput.annualPeriods.map((period, index) => ({
        ...period,
        periodEndDate: `${2022 + index}-12-31`,
        balanceSheetDate: `${2022 + index}-12-31`,
      })),
      market: {
        ...durableCompounderInput.market,
        price: 30,
        priceDate: "2026-08-27",
        currency: "USD",
        marketCap: 6000,
        marketCapAsOf: "2026-08-27",
        marketCapCurrency: "USD",
        sharesOutstanding: 102,
        sharesOutstandingAsOf: "2026-08-27",
        enterpriseValue: 6100,
      },
    });

    expect(metrics.valuation).toMatchObject({
      marketCap: null,
      enterpriseValue: null,
      priceEarnings: null,
      priceSales: null,
      evEbitda: null,
      freeCashFlowYield: null,
      earningsYield: null,
    });
    expect(metrics.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "shareBasisAlignment", severity: "high" }),
    ]));
  });

  it("does not flag share-basis mismatch when market cap and quote price are from different dates", () => {
    const metrics = computeFinancialMetrics({
      ...durableCompounderInput,
      analysisDate: "2026-08-30T00:00:00.000Z",
      company: {
        ...durableCompounderInput.company,
        reportingCurrency: "USD",
        tradingCurrency: "USD",
      },
      market: {
        ...durableCompounderInput.market,
        price: 30,
        priceDate: "2026-08-30",
        currency: "USD",
        marketCap: 6000,
        marketCapAsOf: "2026-08-27",
        marketCapCurrency: "USD",
        sharesOutstanding: 102,
        sharesOutstandingAsOf: "2026-06-30",
        enterpriseValue: 6100,
      },
    });

    expect(metrics.valuation.marketCap).toBe(6000);
    expect(metrics.missingData).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "shareBasisAlignment" }),
    ]));
  });
  it("does not compare current market cap with an older share-count observation", () => {
    const metrics = computeFinancialMetrics({
      ...durableCompounderInput,
      analysisDate: "2026-08-30T00:00:00.000Z",
      company: { ...durableCompounderInput.company, reportingCurrency: "USD", tradingCurrency: "USD" },
      market: {
        ...durableCompounderInput.market, price: 30, priceDate: "2026-08-30", currency: "USD",
        marketCap: 6000, marketCapAsOf: "2026-08-30", marketCapCurrency: "USD",
        sharesOutstanding: 102, sharesOutstandingAsOf: "2026-06-30", enterpriseValue: 6100,
      },
    });
    expect(metrics.valuation.marketCap).toBe(6000);
    expect(metrics.missingData).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "shareBasisAlignment" }),
    ]));
  });

  it("uses actual fiscal-year distance for three-year CAGR when an intermediate year is missing", () => {
    const annualPeriods = [
      { fiscalYear: 2020, periodEndDate: "2020-12-31", currency: "USD", revenue: 80 },
      { fiscalYear: 2021, periodEndDate: "2021-12-31", currency: "USD", revenue: 100 },
      { fiscalYear: 2023, periodEndDate: "2023-12-31", currency: "USD", revenue: 150 },
      { fiscalYear: 2024, periodEndDate: "2024-12-31", currency: "USD", revenue: 200 },
    ];

    const metrics = computeFinancialMetrics({
      ...durableCompounderInput,
      annualPeriods,
      market: undefined,
    });

    const years = (Date.parse("2024-12-31") - Date.parse("2021-12-31")) / 86_400_000 / 365.2425;
    expect(metrics.growth.revenueCagr3y).toBeCloseTo((200 / 100) ** (1 / years) - 1, 8);
    expect(metrics.growth.revenueGrowthYoY).toBeCloseTo(200 / 150 - 1, 5);
  });

  it("returns null instead of labeling a two-year history as three-year CAGR", () => {
    const metrics = computeFinancialMetrics({
      ...durableCompounderInput,
      annualPeriods: [
        { fiscalYear: 2022, periodEndDate: "2022-12-31", currency: "USD", revenue: 100 },
        { fiscalYear: 2024, periodEndDate: "2024-12-31", currency: "USD", revenue: 160 },
      ],
      market: undefined,
    });

    expect(metrics.growth.revenueCagr3y).toBeNull();
    expect(metrics.growth.revenueGrowthYoY).toBeNull();
  });

  it("uses the real date span for a near-three-year CAGR", () => {
    const days = (Date.parse("2024-01-15") - Date.parse("2021-01-01")) / 86_400_000;
    const years = days / 365.2425;
    const metrics = computeFinancialMetrics({
      ...durableCompounderInput,
      annualPeriods: [
        { fiscalYear: 2020, periodEndDate: "2021-01-01", currency: "USD", revenue: 100 },
        { fiscalYear: 2023, periodEndDate: "2024-01-15", currency: "USD", revenue: 160 },
      ],
      market: undefined,
    });

    expect(metrics.growth.revenueCagr3y).toBeCloseTo((160 / 100) ** (1 / years) - 1, 8);
  });

  it("accepts adjacent 53-week fiscal years as comparable annual periods", () => {
    const metrics = computeFinancialMetrics({
      ...durableCompounderInput,
      annualPeriods: [
        { fiscalYear: 2023, periodEndDate: "2023-09-30", currency: "USD", revenue: 100 },
        { fiscalYear: 2024, periodEndDate: "2024-10-05", currency: "USD", revenue: 110 },
      ],
      market: undefined,
    });

    expect(metrics.growth.revenueGrowthYoY).toBeCloseTo(0.1, 8);
  });

  it("computes dividend CAGR from comparable annual periods even when TTM exists", () => {
    const annualPeriods = [
      { fiscalYear: 2021, periodEndDate: "2021-12-31", currency: "USD", dividendsPaid: 100 },
      { fiscalYear: 2022, periodEndDate: "2022-12-31", currency: "USD", dividendsPaid: 110 },
      { fiscalYear: 2023, periodEndDate: "2023-12-31", currency: "USD", dividendsPaid: 120 },
      { fiscalYear: 2024, periodEndDate: "2024-12-31", currency: "USD", dividendsPaid: 133.1 },
    ];
    const metrics = computeFinancialMetrics({
      ...durableCompounderInput,
      annualPeriods,
      trailingTwelveMonths: {
        form: "TTM",
        periodBasis: "TTM_REPORTED",
        periodEndDate: "2025-06-30",
        currency: "USD",
        dividendsPaid: 500,
      },
      market: undefined,
    });

    const years = (Date.parse("2024-12-31") - Date.parse("2021-12-31")) / 86_400_000 / 365.2425;
    expect(metrics.cashFlow.dividendCagr3y).toBeCloseTo((133.1 / 100) ** (1 / years) - 1, 8);
  });

  it("calculates revenue acceleration from two comparable annual growth intervals", () => {
    const metrics = computeFinancialMetrics({
      ...durableCompounderInput,
      annualPeriods: [
        { fiscalYear: 2022, periodEndDate: "2022-12-31", currency: "USD", revenue: 100 },
        { fiscalYear: 2023, periodEndDate: "2023-12-31", currency: "USD", revenue: 110 },
        { fiscalYear: 2024, periodEndDate: "2024-12-31", currency: "USD", revenue: 132 },
      ],
      market: undefined,
    });

    expect(metrics.trends.revenueAcceleration).toBeCloseTo(0.1, 8);
  });

  it("does not report perfect stability from non-contiguous random fiscal years", () => {
    const metrics = computeFinancialMetrics({
      ...durableCompounderInput,
      annualPeriods: [
        { fiscalYear: 2018, periodEndDate: "2018-12-31", currency: "USD", revenue: 100, operatingIncome: 20, grossProfit: 50, operatingCashFlow: 30, capitalExpenditures: 10 },
        { fiscalYear: 2021, periodEndDate: "2021-12-31", currency: "USD", revenue: 100, operatingIncome: 20, grossProfit: 50, operatingCashFlow: 30, capitalExpenditures: 10 },
        { fiscalYear: 2024, periodEndDate: "2024-12-31", currency: "USD", revenue: 100, operatingIncome: 20, grossProfit: 50, operatingCashFlow: 30, capitalExpenditures: 10 },
      ],
      market: undefined,
    });

    expect(metrics.cashFlow.operatingMarginStability).toBeNull();
    expect(metrics.cashFlow.grossMarginStability).toBeNull();
    expect(metrics.cashFlow.freeCashFlowStability).toBeNull();
  });

  it("refuses valuation metrics when market price data is stale", () => {
    const metrics = computeFinancialMetrics({
      ...durableCompounderInput,
      analysisDate: "2026-08-25T00:00:00.000Z",
      market: {
        ...durableCompounderInput.market,
        currency: "USD",
        priceDate: "2026-07-01",
      },
    });

    expect(metrics.valuation).toMatchObject({
      marketCap: null,
      enterpriseValue: null,
      priceEarnings: null,
      priceSales: null,
      freeCashFlowYield: null,
      earningsYield: null,
    });
    expect(metrics.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "marketPriceFreshness",
        impact: "metric",
        severity: "high",
      }),
    ]));
  });

  it("rejects stale reported market cap when no fresh derivation path exists", () => {
    const metrics = computeFinancialMetrics({
      ...durableCompounderInput,
      analysisDate: "2026-08-25T00:00:00.000Z",
      annualPeriods: durableCompounderInput.annualPeriods.map((period, index) => ({
        ...period,
        currentSharesOutstanding: index === durableCompounderInput.annualPeriods.length - 1 ? null : period.currentSharesOutstanding,
      })),
      market: {
        ...durableCompounderInput.market,
        currency: "USD",
        priceDate: "2026-08-25",
        marketCap: 9_999,
        marketCapAsOf: "2026-06-01",
        marketCapCurrency: "USD",
        sharesOutstanding: null,
      },
    });

    expect(metrics.valuation.marketCap).toBeNull();
    expect(metrics.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "marketCapFreshness", severity: "high" }),
    ]));
  });

  it("derives current market cap only from fresh current shares and a fresh price", () => {
    const fresh = computeFinancialMetrics({
      ...durableCompounderInput,
      analysisDate: "2026-08-25T00:00:00.000Z",
      market: {
        ...durableCompounderInput.market,
        currency: "USD",
        price: 30,
        priceDate: "2026-08-25",
        marketCap: 9_999,
        marketCapAsOf: "2026-06-01",
        marketCapCurrency: "USD",
        sharesOutstanding: 102,
        sharesOutstandingAsOf: "2026-08-20",
      },
    });
    const staleShares = computeFinancialMetrics({
      ...durableCompounderInput,
      analysisDate: "2026-08-25T00:00:00.000Z",
      annualPeriods: durableCompounderInput.annualPeriods.map((period) => ({ ...period, currentSharesOutstanding: null })),
      market: {
        ...durableCompounderInput.market,
        currency: "USD",
        price: 30,
        priceDate: "2026-08-25",
        marketCap: null,
        sharesOutstanding: 102,
        sharesOutstandingAsOf: "2025-12-31",
      },
    });

    expect(fresh.valuation.marketCap).toBe(3_060);
    expect(staleShares.valuation.marketCap).toBeNull();
    expect(staleShares.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "sharesOutstandingFreshness", severity: "high" }),
    ]));
  });

  it("rejects a market cap reported in a currency different from the trading currency", () => {
    const metrics = computeFinancialMetrics({
      ...durableCompounderInput,
      analysisDate: "2026-08-25T00:00:00.000Z",
      market: {
        ...durableCompounderInput.market,
        currency: "USD",
        priceDate: "2026-08-25",
        marketCap: 3_060,
        marketCapAsOf: "2026-08-25",
        marketCapCurrency: "EUR",
        sharesOutstanding: null,
      },
    });

    expect(metrics.valuation.marketCap).toBeNull();
    expect(metrics.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "marketCapCurrency", severity: "high" }),
    ]));
  });

  it("refuses valuation metrics when market price data is future-dated", () => {
    const metrics = computeFinancialMetrics({
      ...durableCompounderInput,
      analysisDate: "2026-08-25T00:00:00.000Z",
      market: {
        ...durableCompounderInput.market,
        currency: "USD",
        priceDate: "2026-09-15",
      },
    });

    expect(metrics.valuation).toMatchObject({
      marketCap: null,
      enterpriseValue: null,
      priceEarnings: null,
      priceSales: null,
      freeCashFlowYield: null,
      earningsYield: null,
    });
    expect(metrics.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "marketPriceFreshness",
        impact: "metric",
        severity: "high",
      }),
    ]));
  });

  it("reports missing or unsafe denominators instead of producing misleading growth", () => {
    const metrics = computeFinancialMetrics(missingDataInput);

    expect(metrics.growth.revenueGrowthYoY).toBeNull();
    expect(metrics.growth.revenueCagr3y).toBeNull();
    expect(metrics.valuation.marketCap).toBeNull();
    expect(metrics.missingData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "marketCap",
          impact: "metric",
        }),
        expect.objectContaining({
          field: "revenueGrowthYoY",
          impact: "metric",
        }),
      ]),
    );
  });

  it("uses prior provider-reported TTM balances for TTM return metrics without constructed-YTD metadata", () => {
    const current = {
      ...durableCompounderInput.annualPeriods.at(-1)!,
      form: "TTM",
      periodBasis: "TTM_REPORTED" as const,
      periodEndDate: "2026-06-30",
      balanceSheetDate: "2026-06-30",
      revenue: 1_300,
      operatingIncome: 330,
      netIncome: 250,
      operatingCashFlow: 290,
      capitalExpenditures: 25,
      totalAssets: 1_500,
      totalEquity: 700,
      totalDebt: 240,
      cashAndEquivalents: 190,
    };
    const prior = {
      ...current,
      periodEndDate: "2025-06-30",
      balanceSheetDate: "2025-06-30",
      revenue: 1_150,
      operatingIncome: 285,
      netIncome: 215,
      operatingCashFlow: 250,
      totalAssets: 1_300,
      totalEquity: 610,
      totalDebt: 225,
      cashAndEquivalents: 165,
    };
    const metrics = computeFinancialMetrics({
      ...durableCompounderInput,
      trailingTwelveMonths: current,
      priorTrailingTwelveMonths: prior,
    });

    expect(metrics.growth.revenueGrowthBasis).toBe("TTM_YOY");
    expect(metrics.growth.revenueGrowthYoY).toBeCloseTo(1_300 / 1_150 - 1, 5);
    expect(metrics.ratios.returnOnAssets).toBeCloseTo(250 / ((1_500 + 1_300) / 2), 5);
    expect(metrics.ratios.returnOnEquity).toBeCloseTo(250 / ((700 + 610) / 2), 5);
    expect(metrics.ratios.returnOnInvestedCapital).not.toBeNull();
    expect(metrics.cashFlow.accrualRatio).not.toBeNull();
    expect(metrics.missingData).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "returnMetricAverageBalances" }),
    ]));
  });

  it("uses a provider-reported prior balance sheet for TTM return denominators without changing annual growth fallback", () => {
    const current = {
      ...durableCompounderInput.annualPeriods.at(-1)!,
      form: "TTM",
      periodBasis: "TTM_REPORTED" as const,
      periodEndDate: "2026-06-30",
      balanceSheetDate: "2026-06-30",
      revenue: 1_300,
      operatingIncome: 330,
      netIncome: 250,
      operatingCashFlow: 290,
      capitalExpenditures: 25,
      totalAssets: 1_500,
      totalEquity: 700,
      totalDebt: 240,
      cashAndEquivalents: 190,
    };
    const priorBalanceSheet = {
      periodEndDate: "2025-06-30",
      balanceSheetDate: "2025-06-30",
      currency: "USD",
      totalAssets: 1_300,
      totalEquity: 610,
      totalDebt: 225,
      cashAndEquivalents: 165,
    };
    const metrics = computeFinancialMetrics({
      ...durableCompounderInput,
      trailingTwelveMonths: current,
      priorTrailingTwelveMonths: undefined,
      priorComparableBalanceSheet: priorBalanceSheet,
    });

    expect(metrics.growth.revenueGrowthBasis).toBe("ANNUAL_YOY");
    expect(metrics.growth.revenueGrowthYoY).toBeCloseTo(0.2, 5);
    expect(metrics.ratios.returnOnAssets).toBeCloseTo(250 / ((1_500 + 1_300) / 2), 5);
    expect(metrics.ratios.returnOnEquity).toBeCloseTo(250 / ((700 + 610) / 2), 5);
    expect(metrics.ratios.returnOnInvestedCapital).not.toBeNull();
    expect(metrics.cashFlow.accrualRatio).not.toBeNull();
    expect(metrics.missingData).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "returnMetricAverageBalances" }),
    ]));
  });

  it("uses same-period annual operating income and interest expense when TTM interest expense is unavailable", () => {
    const trailingTwelveMonths = {
      ...durableCompounderInput.annualPeriods.at(-1)!,
      form: "TTM",
      periodBasis: "TTM_REPORTED" as const,
      periodEndDate: "2026-06-30",
      balanceSheetDate: "2026-06-30",
      operatingIncome: 500,
      interestExpense: null,
    };
    const metrics = computeFinancialMetrics({ ...durableCompounderInput, trailingTwelveMonths });
    const latestAnnual = durableCompounderInput.annualPeriods.at(-1)!;

    expect(latestAnnual.operatingIncome).not.toBeNull();
    expect(latestAnnual.interestExpense).not.toBeNull();
    expect(metrics.ratios.interestCoverage).toBeCloseTo(
      latestAnnual.operatingIncome! / Math.abs(latestAnnual.interestExpense!),
      5,
    );
    expect(metrics.ratios.interestCoverage).not.toBeCloseTo(500 / Math.abs(latestAnnual.interestExpense!), 5);
  });
  it("uses explicit annual growth fallback but no mismatched annual balance for TTM returns", () => {
    const trailingTwelveMonths = {
      ...durableCompounderInput.annualPeriods.at(-1)!,
      form: "TTM",
      periodBasis: "TTM_Q3_9M" as const,
      periodEndDate: "2025-06-30",
      balanceSheetDate: "2025-06-30",
      provenance: {
        revenue: { source: "fixture", valueKind: "derived" as const, periodBasis: "TTM_Q3_9M" as const, currentYtdDurationDays: 272 },
        grossProfit: { source: "fixture", valueKind: "derived" as const, periodBasis: "TTM_Q3_9M" as const, currentYtdDurationDays: 272 },
        operatingIncome: { source: "fixture", valueKind: "derived" as const, periodBasis: "TTM_Q3_9M" as const, currentYtdDurationDays: 272 },
        netIncome: { source: "fixture", valueKind: "derived" as const, periodBasis: "TTM_Q3_9M" as const, currentYtdDurationDays: 272 },
        operatingCashFlow: { source: "fixture", valueKind: "derived" as const, periodBasis: "TTM_Q3_9M" as const, currentYtdDurationDays: 272 },
        capitalExpenditures: { source: "fixture", valueKind: "derived" as const, periodBasis: "TTM_Q3_9M" as const, currentYtdDurationDays: 272 },
      },
    };
    const metrics = computeFinancialMetrics({ ...durableCompounderInput, trailingTwelveMonths });

    expect(metrics.growth.revenueGrowthBasis).toBe("ANNUAL_YOY");
    expect(metrics.growth.revenueGrowthYoY).toBeCloseTo(0.2, 5);
    expect(metrics.ratios.returnOnEquity).toBeNull();
    expect(metrics.ratios.returnOnAssets).toBeNull();
    expect(metrics.ratios.returnOnInvestedCapital).toBeNull();
  });
});
