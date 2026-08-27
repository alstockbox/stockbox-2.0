import type { FinancialAnalysisInput } from "./types";

export const DATA_FRESHNESS_THRESHOLDS_DAYS = {
  financialFlow: 220,
  balanceSheet: 220,
  annualFinancialFlow: 455,
  annualBalanceSheet: 455,
  marketPrice: 10,
  marketCap: 10,
  sharesOutstanding: 180,
} as const;

const FUTURE_DATE_TOLERANCE_DAYS = 1;

export type DataDomainStatus = "current" | "stale" | "unavailable";

function ageInDays(date: string | null, analysisDate: string): number | null {
  if (!date) return null;
  const age = (Date.parse(analysisDate) - Date.parse(date)) / 86_400_000;
  if (!Number.isFinite(age) || age < -FUTURE_DATE_TOLERANCE_DAYS) return null;
  return Math.max(0, Math.floor(age));
}

function domainStatus(age: number | null, threshold: number): DataDomainStatus {
  if (age === null) return "unavailable";
  return age > threshold ? "stale" : "current";
}

export function dataDateStatus(
  date: string | null | undefined,
  analysisDate: string,
  thresholdDays: number,
): { ageDays: number | null; status: DataDomainStatus } {
  const ageDays = ageInDays(date ?? null, analysisDate);
  return { ageDays, status: domainStatus(ageDays, thresholdDays) };
}

export function assessDataFreshness(input: FinancialAnalysisInput) {
  const annual = [...input.annualPeriods].sort((left, right) =>
    (left.periodEndDate ?? String(left.fiscalYear ?? "")).localeCompare(right.periodEndDate ?? String(right.fiscalYear ?? ""))
  );
  const latestAnnual = annual.at(-1);
  const analysisDate = input.analysisDate ?? new Date().toISOString();
  const financialFlowPeriodEnd = input.trailingTwelveMonths?.periodEndDate ?? latestAnnual?.periodEndDate ?? null;
  const ttmHasBalance = [input.trailingTwelveMonths?.totalAssets, input.trailingTwelveMonths?.totalLiabilities, input.trailingTwelveMonths?.totalEquity]
    .some((value) => typeof value === "number" && Number.isFinite(value));
  const annualHasBalance = [latestAnnual?.totalAssets, latestAnnual?.totalLiabilities, latestAnnual?.totalEquity]
    .some((value) => typeof value === "number" && Number.isFinite(value));
  const balanceSheetPeriodEnd = ttmHasBalance
    ? input.trailingTwelveMonths?.balanceSheetDate ?? input.trailingTwelveMonths?.periodEndDate ?? null
    : annualHasBalance
      ? latestAnnual?.balanceSheetDate ?? latestAnnual?.periodEndDate ?? null
      : null;
  const marketPriceDate = input.market?.priceDate ?? null;
  const hasMarketShares = typeof input.market?.sharesOutstanding === "number" && Number.isFinite(input.market.sharesOutstanding);
  const sharesOutstandingDate = hasMarketShares
    ? input.market?.sharesOutstandingAsOf ?? input.market?.priceDate ?? null
    : input.trailingTwelveMonths?.balanceSheetDate
      ?? input.trailingTwelveMonths?.periodEndDate
      ?? latestAnnual?.balanceSheetDate
      ?? latestAnnual?.periodEndDate
      ?? null;
  const financialFlowAgeDays = ageInDays(financialFlowPeriodEnd, analysisDate);
  const balanceSheetAgeDays = ageInDays(balanceSheetPeriodEnd, analysisDate);
  const marketPriceAgeDays = ageInDays(marketPriceDate, analysisDate);
  const sharesOutstandingAgeDays = ageInDays(sharesOutstandingDate, analysisDate);
  const usesInterimFlow = Boolean(input.trailingTwelveMonths);
  const financialFlowThreshold = usesInterimFlow
    ? DATA_FRESHNESS_THRESHOLDS_DAYS.financialFlow
    : DATA_FRESHNESS_THRESHOLDS_DAYS.annualFinancialFlow;
  const balanceSheetThreshold = usesInterimFlow
    ? DATA_FRESHNESS_THRESHOLDS_DAYS.balanceSheet
    : DATA_FRESHNESS_THRESHOLDS_DAYS.annualBalanceSheet;
  const financialFlowStatus = domainStatus(financialFlowAgeDays, financialFlowThreshold);
  const balanceSheetStatus = domainStatus(balanceSheetAgeDays, balanceSheetThreshold);
  const marketPriceStatus = domainStatus(marketPriceAgeDays, DATA_FRESHNESS_THRESHOLDS_DAYS.marketPrice);
  const sharesOutstandingStatus = domainStatus(sharesOutstandingAgeDays, DATA_FRESHNESS_THRESHOLDS_DAYS.sharesOutstanding);
  const hasReportedMarketCap = typeof input.market?.marketCap === "number" && Number.isFinite(input.market.marketCap);
  const reportedMarketCapDate = hasReportedMarketCap ? input.market?.marketCapAsOf ?? input.market?.priceDate ?? null : null;
  const reportedMarketCapAgeDays = ageInDays(reportedMarketCapDate, analysisDate);
  const reportedMarketCapStatus = domainStatus(reportedMarketCapAgeDays, DATA_FRESHNESS_THRESHOLDS_DAYS.marketCap);
  const hasPeriodShares = typeof input.trailingTwelveMonths?.currentSharesOutstanding === "number"
    || typeof latestAnnual?.currentSharesOutstanding === "number";
  const canDeriveCurrentMarketCap = typeof input.market?.price === "number"
    && Number.isFinite(input.market.price)
    && (hasMarketShares || hasPeriodShares)
    && marketPriceStatus === "current"
    && sharesOutstandingStatus === "current";
  const marketCapAgeDays = reportedMarketCapStatus === "current"
    ? reportedMarketCapAgeDays
    : canDeriveCurrentMarketCap ? Math.max(marketPriceAgeDays ?? 0, sharesOutstandingAgeDays ?? 0) : reportedMarketCapAgeDays;
  const marketCapStatus = reportedMarketCapStatus === "current"
    ? "current" as const
    : canDeriveCurrentMarketCap ? "current" as const : reportedMarketCapStatus;
  const dataStatus = financialFlowStatus === "stale" || balanceSheetStatus === "stale"
    ? "stale" as const
    : financialFlowStatus === "unavailable"
      ? "unavailable" as const
      : "current" as const;
  return {
    dataStatus,
    financialFlowPeriodEnd,
    balanceSheetPeriodEnd,
    marketPriceDate,
    financialFlowAgeDays,
    balanceSheetAgeDays,
    marketPriceAgeDays,
    marketCapAgeDays,
    sharesOutstandingAgeDays,
    financialFlowStatus,
    balanceSheetStatus,
    marketPriceStatus,
    marketCapStatus,
    sharesOutstandingStatus,
  };
}
