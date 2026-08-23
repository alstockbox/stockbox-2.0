import type { FinancialAnalysisInput } from "./types";

export const DATA_FRESHNESS_THRESHOLDS_DAYS = {
  financialFlow: 550,
  balanceSheet: 550,
  marketPrice: 10,
} as const;

export type DataDomainStatus = "current" | "stale" | "unavailable";

function ageInDays(date: string | null, analysisDate: string): number | null {
  if (!date) return null;
  const age = (Date.parse(analysisDate) - Date.parse(date)) / 86_400_000;
  return Number.isFinite(age) ? Math.max(0, Math.floor(age)) : null;
}

function domainStatus(age: number | null, threshold: number): DataDomainStatus {
  if (age === null) return "unavailable";
  return age > threshold ? "stale" : "current";
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
  const financialFlowAgeDays = ageInDays(financialFlowPeriodEnd, analysisDate);
  const balanceSheetAgeDays = ageInDays(balanceSheetPeriodEnd, analysisDate);
  const marketPriceAgeDays = ageInDays(marketPriceDate, analysisDate);
  const financialFlowStatus = domainStatus(financialFlowAgeDays, DATA_FRESHNESS_THRESHOLDS_DAYS.financialFlow);
  const balanceSheetStatus = domainStatus(balanceSheetAgeDays, DATA_FRESHNESS_THRESHOLDS_DAYS.balanceSheet);
  const marketPriceStatus = domainStatus(marketPriceAgeDays, DATA_FRESHNESS_THRESHOLDS_DAYS.marketPrice);
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
    financialFlowStatus,
    balanceSheetStatus,
    marketPriceStatus,
  };
}
