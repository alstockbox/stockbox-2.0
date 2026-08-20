import type {
  FinancialAnalysisInput,
  FinancialMetrics,
  FinancialPeriod,
  MissingDataItem,
  ValuationMetrics,
} from "./types";
import {
  addMissingData,
  calculateCagr,
  calculateGrowth,
  firstFinite,
  isFiniteNumber,
  safeDivide,
} from "./math";

const DEFAULT_TAX_RATE = 0.21;

function periodSortValue(period: FinancialPeriod): number {
  if (isFiniteNumber(period.fiscalYear)) {
    return period.fiscalYear;
  }

  if (period.periodEndDate) {
    const timestamp = Date.parse(period.periodEndDate);
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  return 0;
}

export function sortFinancialPeriods(periods: FinancialPeriod[]): FinancialPeriod[] {
  return [...periods].sort((a, b) => periodSortValue(a) - periodSortValue(b));
}

export function deriveFreeCashFlow(period: FinancialPeriod | null | undefined): number | null {
  if (!period) return null;
  if (isFiniteNumber(period.freeCashFlow)) return period.freeCashFlow;

  if (!isFiniteNumber(period.operatingCashFlow) || !isFiniteNumber(period.capitalExpenditures)) {
    return null;
  }

  return period.capitalExpenditures < 0
    ? period.operatingCashFlow + period.capitalExpenditures
    : period.operatingCashFlow - period.capitalExpenditures;
}

function addMissingIfNull(
  missingData: MissingDataItem[],
  value: number | null,
  field: string,
  reason: string,
): void {
  if (value === null) {
    addMissingData(missingData, field, reason, "metric", "medium");
  }
}

function deriveMarketCap(input: FinancialAnalysisInput, latest: FinancialPeriod | null): number | null {
  const explicitMarketCap = input.market?.marketCap;
  if (isFiniteNumber(explicitMarketCap)) return explicitMarketCap;

  const price = input.market?.price;
  const shares = firstFinite(input.market?.sharesOutstanding, latest?.sharesDiluted);

  if (isFiniteNumber(price) && isFiniteNumber(shares)) {
    return price * shares;
  }

  return null;
}

function deriveEnterpriseValue(
  input: FinancialAnalysisInput,
  latest: FinancialPeriod | null,
  marketCap: number | null,
): number | null {
  const explicitEnterpriseValue = input.market?.enterpriseValue;
  if (isFiniteNumber(explicitEnterpriseValue)) return explicitEnterpriseValue;
  if (!isFiniteNumber(marketCap)) return null;

  const debt = latest?.totalDebt ?? 0;
  const cash = latest?.cashAndEquivalents ?? 0;
  return marketCap + (isFiniteNumber(debt) ? debt : 0) - (isFiniteNumber(cash) ? cash : 0);
}

function deriveValuationMetrics(
  input: FinancialAnalysisInput,
  latest: FinancialPeriod | null,
  revenue: number | null,
  ebitda: number | null,
  netIncome: number | null,
  equity: number | null,
  freeCashFlow: number | null,
  epsGrowth: number | null,
): ValuationMetrics {
  const marketCap = deriveMarketCap(input, latest);
  const enterpriseValue = deriveEnterpriseValue(input, latest, marketCap);
  const priceEarnings = netIncome && netIncome > 0 ? safeDivide(marketCap, netIncome) : null;
  const earningsYield = marketCap && marketCap > 0 ? safeDivide(netIncome, marketCap) : null;
  const peGrowthRate = firstFinite(input.estimates?.nextYearEpsGrowth, epsGrowth);
  const peg =
    priceEarnings !== null && peGrowthRate !== null && peGrowthRate > 0
      ? priceEarnings / (peGrowthRate * 100)
      : null;

  return {
    marketCap,
    enterpriseValue,
    priceEarnings,
    priceSales: revenue && revenue > 0 ? safeDivide(marketCap, revenue) : null,
    priceBook: equity && equity > 0 ? safeDivide(marketCap, equity) : null,
    evSales: revenue && revenue > 0 ? safeDivide(enterpriseValue, revenue) : null,
    evEbitda: ebitda && ebitda > 0 ? safeDivide(enterpriseValue, ebitda) : null,
    freeCashFlowYield: marketCap && marketCap > 0 ? safeDivide(freeCashFlow, marketCap) : null,
    earningsYield,
    peg,
  };
}

export function computeFinancialMetrics(input: FinancialAnalysisInput): FinancialMetrics {
  const annualPeriods = sortFinancialPeriods(input.annualPeriods);
  const latestAnnual = annualPeriods.at(-1) ?? null;
  const previousAnnual = annualPeriods.at(-2) ?? null;
  const threeYearPrior = annualPeriods.at(-4) ?? null;
  const latest = input.trailingTwelveMonths ?? latestAnnual;
  const previous = previousAnnual;
  const missingData: MissingDataItem[] = [];

  if (!latest) {
    addMissingData(missingData, "annualPeriods", "At least one financial period is required.", "metric", "high");
  }

  const revenue = latest?.revenue ?? null;
  const previousRevenue = previous?.revenue ?? null;
  const grossProfit = latest?.grossProfit ?? null;
  const previousGrossProfit = previous?.grossProfit ?? null;
  const operatingIncome = latest?.operatingIncome ?? null;
  const previousOperatingIncome = previous?.operatingIncome ?? null;
  const ebitda = latest?.ebitda ?? null;
  const netIncome = latest?.netIncome ?? null;
  const operatingCashFlow = latest?.operatingCashFlow ?? null;
  const freeCashFlow = deriveFreeCashFlow(latest);
  const equity = latest?.totalEquity ?? null;
  const assets = latest?.totalAssets ?? null;
  const debt = latest?.totalDebt ?? null;
  const cash = latest?.cashAndEquivalents ?? null;
  const currentAssets = latest?.currentAssets ?? null;
  const currentLiabilities = latest?.currentLiabilities ?? null;
  const interestExpense = latest?.interestExpense ?? null;
  const investedCapital =
    isFiniteNumber(debt) || isFiniteNumber(equity) || isFiniteNumber(cash)
      ? (debt ?? 0) + (equity ?? 0) - (cash ?? 0)
      : null;
  const nopat = isFiniteNumber(operatingIncome) ? operatingIncome * (1 - DEFAULT_TAX_RATE) : null;
  const latestGrossMargin = safeDivide(grossProfit, revenue);
  const previousGrossMargin = safeDivide(previousGrossProfit, previousRevenue);
  const latestOperatingMargin = safeDivide(operatingIncome, revenue);
  const previousOperatingMargin = safeDivide(previousOperatingIncome, previousRevenue);

  const growth = {
    revenueGrowthYoY: calculateGrowth(latestAnnual?.revenue, previousAnnual?.revenue),
    revenueCagr3y: calculateCagr(threeYearPrior?.revenue, latestAnnual?.revenue, 3),
    epsGrowthYoY: calculateGrowth(latestAnnual?.epsDiluted, previousAnnual?.epsDiluted),
    epsCagr3y: calculateCagr(threeYearPrior?.epsDiluted, latestAnnual?.epsDiluted, 3),
    freeCashFlowGrowthYoY: calculateGrowth(deriveFreeCashFlow(latestAnnual), deriveFreeCashFlow(previousAnnual)),
    freeCashFlowCagr3y: calculateCagr(deriveFreeCashFlow(threeYearPrior), deriveFreeCashFlow(latestAnnual), 3),
  };

  const ratios = {
    currentRatio: safeDivide(currentAssets, currentLiabilities),
    debtToEquity: equity && equity > 0 ? safeDivide(debt, equity) : null,
    netDebt: isFiniteNumber(debt) || isFiniteNumber(cash) ? (debt ?? 0) - (cash ?? 0) : null,
    netDebtToEbitda:
      ebitda && ebitda > 0
        ? safeDivide((debt ?? 0) - (cash ?? 0), ebitda)
        : null,
    interestCoverage:
      isFiniteNumber(operatingIncome) && isFiniteNumber(interestExpense) && interestExpense !== 0
        ? operatingIncome / Math.abs(interestExpense)
        : null,
    returnOnEquity: equity && equity > 0 ? safeDivide(netIncome, equity) : null,
    returnOnAssets: assets && assets > 0 ? safeDivide(netIncome, assets) : null,
    returnOnInvestedCapital:
      investedCapital && investedCapital > 0 ? safeDivide(nopat, investedCapital) : null,
    cashConversion: netIncome && netIncome > 0 ? safeDivide(freeCashFlow, netIncome) : null,
    cashToDebt: debt && debt > 0 ? safeDivide(cash, debt) : null,
    equityToAssets: assets && assets > 0 ? safeDivide(equity, assets) : null,
  };

  const metrics: FinancialMetrics = {
    latestPeriod: latest,
    previousPeriod: previous,
    margins: {
      grossMargin: latestGrossMargin,
      operatingMargin: latestOperatingMargin,
      ebitdaMargin: safeDivide(ebitda, revenue),
      netMargin: safeDivide(netIncome, revenue),
      freeCashFlowMargin: safeDivide(freeCashFlow, revenue),
      operatingCashFlowMargin: safeDivide(operatingCashFlow, revenue),
    },
    growth,
    ratios,
    valuation: deriveValuationMetrics(
      input,
      latest,
      revenue,
      ebitda,
      netIncome,
      equity,
      freeCashFlow,
      growth.epsGrowthYoY,
    ),
    trends: {
      operatingMarginChangeYoY:
        latestOperatingMargin !== null && previousOperatingMargin !== null
          ? latestOperatingMargin - previousOperatingMargin
          : null,
      grossMarginChangeYoY:
        latestGrossMargin !== null && previousGrossMargin !== null
          ? latestGrossMargin - previousGrossMargin
          : null,
      revenueAcceleration: null,
      sharesDilutionYoY: calculateGrowth(latestAnnual?.sharesDiluted, previousAnnual?.sharesDiluted),
    },
    missingData,
  };

  addMissingIfNull(missingData, revenue, "revenue", "Revenue is required for margin and sales multiple calculations.");
  addMissingIfNull(missingData, freeCashFlow, "freeCashFlow", "Free cash flow is required for FCF yield, DCF and cash conversion.");
  addMissingIfNull(missingData, metrics.valuation.marketCap, "marketCap", "Market capitalization is required for valuation ratios.");
  addMissingIfNull(missingData, growth.revenueGrowthYoY, "revenueGrowthYoY", "Two positive annual revenue values are required for YoY growth.");
  addMissingIfNull(missingData, growth.revenueCagr3y, "revenueCagr3y", "Four annual periods with positive revenue are required for 3-year CAGR.");

  return metrics;
}
