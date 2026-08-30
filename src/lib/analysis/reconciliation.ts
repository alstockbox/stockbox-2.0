import { assessDataFreshness } from "./freshness";
import { quotePriceToEconomic } from "./currency-units";
import { currentSharesForDcf, deriveSimpleFreeCashFlow, valuationCurrencyAlignment } from "./metrics";
import { firstFinite, isFiniteNumber } from "./math";
import type { FinancialAnalysisInput, FinancialMetrics, FinancialPeriod, FinancialPeriodBasis, ReconciliationCheck } from "./types";

const ttmFlowFields = [
  "revenue",
  "grossProfit",
  "operatingIncome",
  "netIncome",
  "operatingCashFlow",
  "capitalExpenditures",
] as const;

const returnMetricProvenanceFields = ["returnOnEquity", "returnOnAssets", "returnOnInvestedCapital"] as const;

function returnMetricPeriodBasis(metrics: FinancialMetrics): FinancialPeriodBasis | null {
  const bases = returnMetricProvenanceFields
    .map((field) => metrics.provenance[field]?.periodBasis)
    .filter((basis): basis is FinancialPeriodBasis => Boolean(basis));
  const uniqueBases = [...new Set(bases)];
  return uniqueBases.length === 1 ? uniqueBases[0] : null;
}

export function ttmPeriodBasisCheck(period: FinancialPeriod | undefined): ReconciliationCheck {
  if (!period || period.form !== "TTM") {
    return { code: "ttm_period_basis_consistency", status: "unavailable", message: "No TTM period is in use." };
  }
  const presentFields = ttmFlowFields.filter((field) => isFiniteNumber(period[field]));
  const bases = presentFields.map((field) => period.provenance?.[field]?.periodBasis).filter(Boolean);
  const durations = presentFields
    .map((field) => period.provenance?.[field]?.currentYtdDurationDays)
    .filter((value): value is number => isFiniteNumber(value));
  const basisConsistent = Boolean(period.periodBasis) && bases.length === presentFields.length
    && bases.every((basis) => basis === period.periodBasis);
  const durationConsistent = period.periodBasis === "TTM_REPORTED"
    ? durations.length === 0
    : durations.length === presentFields.length
      && Math.max(...durations) - Math.min(...durations) <= 15;
  return {
    code: "ttm_period_basis_consistency",
    status: basisConsistent && durationConsistent ? "pass" : "warning",
    message: basisConsistent && durationConsistent
      ? `All TTM flow metrics use ${period.periodBasis} with comparable cumulative durations.`
      : "TTM flow metrics do not share one comparable cumulative period basis; annual fallback is required.",
  };
}

function relativeDifference(left: number, right: number): number {
  return Math.abs(left - right) / Math.max(Math.abs(left), Math.abs(right), 1);
}

function compare(code: string, label: string, left: number | null, right: number | null, tolerance: number): ReconciliationCheck {
  if (!isFiniteNumber(left) || !isFiniteNumber(right)) {
    return { code, status: "unavailable", message: `${label} could not be checked because one or more inputs are missing.` };
  }
  const differenceRatio = relativeDifference(left, right);
  return {
    code,
    status: differenceRatio <= tolerance ? "pass" : "warning",
    message: differenceRatio <= tolerance ? `${label} reconciles within tolerance.` : `${label} differs beyond the ${Math.round(tolerance * 100)}% tolerance.`,
    differenceRatio,
  };
}

function epsNetIncomeReconciliationCheck(latest: FinancialPeriod | null | undefined): ReconciliationCheck {
  const epsTimesShares = isFiniteNumber(latest?.epsDiluted) && isFiniteNumber(latest?.sharesDiluted)
    ? latest.epsDiluted * latest.sharesDiluted
    : null;
  const incomeAvailableToCommon = firstFinite(
    latest?.dilutedNetIncomeAvailableToCommon,
    latest?.netIncomeCommonStockholders,
    latest?.netIncome,
  );
  const base = compare(
    "eps_net_income",
    "Diluted EPS times diluted shares versus diluted income available to common shareholders",
    epsTimesShares,
    incomeAvailableToCommon,
    0.08,
  );
  if (base.status !== "warning" || !isFiniteNumber(epsTimesShares) || !isFiniteNumber(incomeAvailableToCommon)) {
    return base;
  }
  const oppositeSigns = epsTimesShares !== 0
    && incomeAvailableToCommon !== 0
    && Math.sign(epsTimesShares) !== Math.sign(incomeAvailableToCommon);
  const periodLabel = latest?.form === "TTM" || latest?.periodBasis?.startsWith("TTM") ? "TTM" : "Annual";
  return {
    ...base,
    message: oppositeSigns
      ? `${periodLabel} diluted EPS times diluted shares and diluted income available to common shareholders have opposite signs.`
      : `${periodLabel} diluted EPS times diluted shares and diluted income available to common shareholders have a same-direction magnitude mismatch beyond the 8% tolerance.`,
  };
}

function usesReportedMarketCap(input: FinancialAnalysisInput, metrics: FinancialMetrics): boolean {
  return isFiniteNumber(input.market?.marketCap)
    && isFiniteNumber(metrics.valuation.marketCap)
    && relativeDifference(input.market.marketCap, metrics.valuation.marketCap) <= 0.000001;
}

function marketCapObservationDateGap(input: FinancialAnalysisInput, metrics: FinancialMetrics): ReconciliationCheck | null {
  if (!usesReportedMarketCap(input, metrics)) return null;
  const priceDate = input.market?.priceDate ?? null;
  if (!priceDate) return null;
  const marketCapDate = input.market?.marketCapAsOf ?? null;
  const sharesDate = input.market?.sharesOutstandingAsOf ?? null;
  const mismatches = [
    marketCapDate && marketCapDate !== priceDate ? "market cap" : null,
    sharesDate && sharesDate !== priceDate ? "shares outstanding" : null,
  ].filter((item): item is string => Boolean(item));
  if (!mismatches.length) return null;
  return {
    code: "market_cap",
    status: "unavailable",
    message: `Market cap versus price times current shares could not be checked because ${mismatches.join(" and ")} use different observation dates than the quote price.`,
  };
}

function marketCapReconciliationCheck(
  input: FinancialAnalysisInput,
  metrics: FinancialMetrics,
  shares: number | null,
): ReconciliationCheck {
  return marketCapObservationDateGap(input, metrics) ?? compare(
    "market_cap",
    "Market cap versus price times current shares",
    metrics.valuation.marketCap,
    isFiniteNumber(input.market?.price) && isFiniteNumber(shares)
      ? (quotePriceToEconomic(input.market.price, input.market.currency ?? input.company.tradingCurrency) ?? Number.NaN) * shares
      : null,
    0.05,
  );
}

export function reconcileFinancialData(input: FinancialAnalysisInput, metrics: FinancialMetrics): ReconciliationCheck[] {
  const latest = metrics.latestPeriod;
  const simpleFcf = deriveSimpleFreeCashFlow(latest);
  const shares = currentSharesForDcf(input, latest);
  const checks = [
    ttmPeriodBasisCheck(input.trailingTwelveMonths),
    compare(
      "balance_sheet_equation",
      "Assets versus liabilities plus parent equity and reported minority interest",
      latest?.totalAssets ?? null,
      isFiniteNumber(latest?.totalLiabilities) && isFiniteNumber(latest?.totalEquity)
        ? latest.totalLiabilities + latest.totalEquity + (isFiniteNumber(latest.minorityInterest) ? latest.minorityInterest : 0)
        : null,
      0.02,
    ),
    compare(
      "gross_profit",
      "Gross profit versus revenue less cost of revenue",
      latest?.grossProfit ?? null,
      isFiniteNumber(latest?.revenue) && isFiniteNumber(latest?.costOfRevenue) ? latest.revenue - latest.costOfRevenue : null,
      0.02,
    ),
    epsNetIncomeReconciliationCheck(latest),
    compare(
      "simple_fcf",
      "Simple FCF versus CFO less absolute capex",
      simpleFcf,
      isFiniteNumber(latest?.operatingCashFlow) && isFiniteNumber(latest?.capitalExpenditures)
        ? latest.operatingCashFlow - Math.abs(latest.capitalExpenditures)
      : null,
      0.000001,
    ),
    marketCapReconciliationCheck(input, metrics, shares),
  ];
  const financialCurrency = latest?.currency ?? input.company.reportingCurrency ?? input.company.currency;
  const marketCurrency = input.market?.currency ?? input.company.tradingCurrency;
  const currencyAlignment = valuationCurrencyAlignment(input, latest);
  if (currencyAlignment !== "unknown" && financialCurrency && marketCurrency) {
    checks.push({
      code: "currency_alignment",
      status: currencyAlignment === "aligned" ? "pass" : "warning",
      message: currencyAlignment === "aligned" ? "Financial and market currencies align." : `Financial currency ${financialCurrency} differs from market currency ${marketCurrency}.`,
    });
  } else {
    checks.push({ code: "currency_alignment", status: "warning", message: "Reporting or trading currency is unknown; valuation alignment cannot be verified." });
  }
  const freshness = assessDataFreshness(input);
  const freshnessCheck = (
    code: string,
    label: string,
    status: "current" | "stale" | "unavailable" | undefined,
  ): ReconciliationCheck => ({
    code,
    status: status === "current" ? "pass" : status === "stale" ? "warning" : "unavailable",
    message: status === "current"
      ? `${label} is within the configured freshness threshold.`
      : status === "stale"
        ? `${label} is stale or future-dated for current valuation use.`
        : `${label} freshness could not be established.`,
  });
  checks.push(
    freshnessCheck("market_cap_freshness", "Market cap", freshness.marketCapStatus),
    freshnessCheck("shares_outstanding_freshness", "Current shares outstanding", freshness.sharesOutstandingStatus),
  );
  const unresolvedSourceConflicts = (input.sourceConflicts ?? []).filter((conflict) => !conflict.resolved);
  if (unresolvedSourceConflicts.length) {
    checks.push({
      code: "provider_source_conflict",
      status: "warning",
      message: `${unresolvedSourceConflicts.length} material provider source conflict(s) require review.`,
    });
  }
  const classification = input.company.classificationDiagnostics;
  if (classification) {
    const uncertain = classification.ambiguous || classification.confidence < 0.6;
    checks.push({
      code: "archetype_classification",
      status: uncertain ? "warning" : "pass",
      message: uncertain
        ? `Archetype classification is uncertain: ${classification.reason}`
        : `Archetype classification is supported: ${classification.reason}`,
    });
  }
  if (input.trailingTwelveMonths?.periodEndDate) {
    const flowEnd = input.trailingTwelveMonths.periodEndDate;
    const balanceEnd = input.trailingTwelveMonths.balanceSheetDate;
    const lag = balanceEnd ? (Date.parse(flowEnd) - Date.parse(balanceEnd)) / 86_400_000 : Number.NaN;
    checks.push({
      code: "balance_sheet_freshness",
      status: Number.isFinite(lag) && lag >= 0 && lag <= 45 ? "pass" : "warning",
      message: Number.isFinite(lag) && lag >= 0 && lag <= 45
        ? "Balance-sheet facts align with the TTM flow endpoint."
        : `Balance-sheet facts are ${Number.isFinite(lag) ? Math.round(lag) : "an unknown number of"} days older than the TTM flow endpoint.`,
    });
    const priorBalanceEnd = input.priorTrailingTwelveMonths?.balanceSheetDate;
    const balanceGap = balanceEnd && priorBalanceEnd
      ? (Date.parse(balanceEnd) - Date.parse(priorBalanceEnd)) / 86_400_000
      : Number.NaN;
    const hasComparableBalanceDates = Boolean(balanceEnd && priorBalanceEnd);
    const comparableBalanceGap = Number.isFinite(balanceGap) && balanceGap >= 330 && balanceGap <= 400;
    const returnBasis = returnMetricPeriodBasis(metrics);
    const returnMetricsUseAnnualFallback = returnBasis === "FY";
    checks.push({
      code: "return_metric_balance_alignment",
      status: !hasComparableBalanceDates || returnMetricsUseAnnualFallback ? "unavailable" : comparableBalanceGap ? "pass" : "warning",
      message: !hasComparableBalanceDates
        ? "Comparable prior-year instant balances are unavailable for TTM return metrics."
        : returnMetricsUseAnnualFallback
          ? "TTM return balance dates are not used; ROE, ROA and ROIC use annual fallback."
        : comparableBalanceGap
          ? "TTM return metrics use current and prior-year comparable instant balances."
          : "Current and prior-year instant balances are not aligned closely enough for TTM return metrics.",
    });
  }
  return checks;
}

export function reconciliationConfidence(checks: ReconciliationCheck[]): number {
  const available = checks.filter((check) => check.status !== "unavailable");
  if (!available.length) return 50;
  const passed = available.filter((check) => check.status === "pass").length;
  return Math.round((passed / available.length) * 100);
}
