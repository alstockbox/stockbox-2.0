import {
  MODEL_VERSION,
  SCORE_COVERAGE_POLICY,
  SCORE_POLICY_VERSION,
  STATIC_BENCHMARK_VERSION,
  benchmarksForSector,
  longTermWeights,
  shortTermWeights,
  weightsForSector,
  weightsForSectorAndProfile,
} from "./config";
import { resolveFinancialArchetype } from "./archetypes";
import {
  clamp,
  firstFinite,
  isFiniteNumber,
  safeDivide,
  scoreHigherIsBetter,
  scoreLowerIsBetter,
  scoreTargetRange,
} from "./math";
import type {
  AnalysisArchetype,
  ConfidenceBreakdown,
  FinancialAnalysisInput,
  FinancialMetrics,
  ScoreContributor,
  ScoreDimension,
  ScoreDimensionKey,
  ScoreResult,
  SpecializedCompanyData,
  SpecializedCoverage,
  ValuationAssumptionQuality,
  FinancialPeriod,
} from "./types";
import { comparableAnnualPeriod, contiguousAnnualHistory, deriveSimpleFreeCashFlow, shareBasisComparable, sortFinancialPeriods, valuationCurrencyAlignment } from "./metrics";
import { summarizeSourceConflicts } from "./source-conflicts";
import { insurerRequiredFields, isPropertyCasualtyInsurer, resolveInsurerSubtype } from "./insurer-subtypes";

const dimensionLabels: Record<ScoreDimensionKey, string> = {
  growth: "Growth",
  profitability: "Profitability",
  financialHealth: "Financial Health",
  valuation: "Valuation",
  cashFlow: "Cash Flow",
  earningsQuality: "Earnings Quality",
  quality: "Business Quality",
  momentum: "Momentum",
  risk: "Risk Resilience",
};

type ContributorInput = {
  label: string;
  value: number | null;
  score: number | null;
  weight: number;
  source?: string;
  period?: string;
  missingReason?: string;
  unsuitable?: boolean;
};

function economicallyUnsuitableReason(reason: string | undefined): boolean {
  return Boolean(reason && (
    /not meaningful when .*non-positive/i.test(reason)
    || /not finite when reported .*zero/i.test(reason)
    || /must be positive/i.test(reason)
  ));
}

function contributor(input: ContributorInput): ScoreContributor {
  const unsuitable = input.unsuitable || economicallyUnsuitableReason(input.missingReason);
  const availability = unsuitable ? "unsuitable" : isFiniteNumber(input.value) && isFiniteNumber(input.score) ? "available" : "missing";
  const score = availability === "available" ? input.score : null;
  return {
    label: input.label,
    value: input.value,
    score,
    weight: input.weight,
    availability,
    missingReason: availability !== "available" ? input.missingReason : undefined,
    source: input.source ?? "canonical financial metrics",
    period: input.period,
    impact: !isFiniteNumber(score) ? "neutral" : score >= 60 ? "positive" : score <= 40 ? "negative" : "neutral",
  };
}
function dimension(key: ScoreDimensionKey, contributors: ScoreContributor[], rationale: string): ScoreDimension {
  const applicable = contributors.filter((item) => item.availability !== "unsuitable");
  const plannedWeight = applicable.reduce((sum, item) => sum + item.weight, 0);
  const available = applicable.filter((item) => item.availability === "available" && isFiniteNumber(item.score));
  const availableWeight = available.reduce((sum, item) => sum + item.weight, 0);
  const coverage = plannedWeight > 0 ? availableWeight / plannedWeight : 0;
  const rawScore = availableWeight > 0
    ? available.reduce((sum, item) => sum + (item.score as number) * item.weight, 0) / availableWeight
    : null;
  const adjustedScore = rawScore === null || coverage < SCORE_COVERAGE_POLICY.dimensionMinimum
    ? null
    : coverage < SCORE_COVERAGE_POLICY.dimensionFull
      ? 50 + (rawScore - 50) * coverage
      : rawScore;
  return {
    key,
    label: dimensionLabels[key],
    score: adjustedScore,
    rawScore,
    adjustedScore,
    coverage,
    plannedWeight,
    availableWeight,
    weight: 0,
    rationale,
    contributors,
    missingData: contributors
      .filter((item) => item.availability === "missing" || (item.availability === "unsuitable" && Boolean(item.missingReason)))
      .map((item) => ({
        field: item.label,
        reason: item.missingReason ?? "Required source data is unavailable.",
        impact: "score" as const,
        severity: "medium" as const,
      })),
  };
}

function annualEndpointForCagr(input: FinancialAnalysisInput): {
  latest: FinancialPeriod | null;
  prior: FinancialPeriod | null;
} {
  const annual = sortFinancialPeriods(input.annualPeriods);
  const latest = annual.at(-1) ?? null;
  return {
    latest,
    prior: comparableAnnualPeriod(annual, latest, 3)?.period ?? null,
  };
}

function latestAnnualPeriod(input: FinancialAnalysisInput): FinancialPeriod | null {
  return sortFinancialPeriods(input.annualPeriods).at(-1) ?? null;
}

function uniquePeriods(periods: Array<FinancialPeriod | null | undefined>): FinancialPeriod[] {
  const seen = new Set<FinancialPeriod>();
  return periods.flatMap((period) => {
    if (!period || seen.has(period)) return [];
    seen.add(period);
    return [period];
  });
}

function epsCagrMissingReason(input: FinancialAnalysisInput): string | undefined {
  const { latest, prior } = annualEndpointForCagr(input);
  if (!latest || !prior) return "Comparable latest and three-year-prior annual periods are required for EPS CAGR.";
  if (!shareBasisComparable(latest, prior)) return "EPS CAGR requires comparable split-adjusted share basis at both endpoints.";
  if (!isFiniteNumber(prior.epsDiluted) || !isFiniteNumber(latest.epsDiluted)) {
    return "Diluted EPS is missing for the latest or three-year-prior annual period.";
  }
  if (prior.epsDiluted <= 0 || latest.epsDiluted <= 0) {
    return "EPS CAGR is not meaningful when diluted EPS is non-positive at either endpoint.";
  }
  return undefined;
}

function netDebtToEbitdaMissingReason(input: FinancialAnalysisInput, metrics: FinancialMetrics): string | undefined {
  const periods = uniquePeriods([metrics.latestPeriod, latestAnnualPeriod(input)]);
  if (!periods.some((period) => isFiniteNumber(period.totalDebt) && isFiniteNumber(period.cashAndEquivalents))) {
    return "Net debt / EBITDA requires reported debt and cash; missing debt is not treated as zero.";
  }
  const ebitdaPeriods = periods.filter((period) => isFiniteNumber(period.ebitda));
  if (!ebitdaPeriods.length) return "EBITDA is missing for the selected leverage period.";
  if (ebitdaPeriods.every((period) => (period.ebitda as number) <= 0)) {
    return "Net debt / EBITDA is not meaningful when EBITDA is non-positive.";
  }
  return undefined;
}

function interestCoverageMissingReason(input: FinancialAnalysisInput, metrics: FinancialMetrics): string | undefined {
  const periods = uniquePeriods([metrics.latestPeriod, latestAnnualPeriod(input)]);
  if (!periods.some((period) => isFiniteNumber(period.operatingIncome))) {
    return "Operating income is missing for the selected interest-coverage period.";
  }
  const interestPeriods = periods.filter((period) => isFiniteNumber(period.interestExpense));
  if (!interestPeriods.length) return "Interest expense is missing or not separately reported for the selected coverage period.";
  if (interestPeriods.every((period) => period.interestExpense === 0)) {
    const debtFreePositiveCoverage = periods.some((period) =>
      period.interestExpense === 0 && isFiniteNumber(period.operatingIncome) && period.operatingIncome > 0
    );
    if (debtFreePositiveCoverage) return undefined;
    return "Interest coverage is not meaningful when operating income is non-positive and reported interest expense is zero.";
  }
  return undefined;
}

function cashToDebtMissingReason(input: FinancialAnalysisInput, metrics: FinancialMetrics): string | undefined {
  const periods = uniquePeriods([metrics.latestPeriod, latestAnnualPeriod(input)]);
  if (!periods.some((period) => isFiniteNumber(period.cashAndEquivalents))) {
    return "Cash / debt requires reported cash and equivalents.";
  }
  if (!periods.some((period) => isFiniteNumber(period.totalDebt))) {
    return "Cash / debt requires reported debt; missing debt is not treated as zero.";
  }
  if (periods.some((period) => period.totalDebt === 0)) {
    return "Cash / debt is not finite when reported debt is zero.";
  }
  return undefined;
}

function annualFcfGrowthMissingReason(input: FinancialAnalysisInput): string | undefined {
  const annual = sortFinancialPeriods(input.annualPeriods);
  const latest = annual.at(-1) ?? null;
  const prior = comparableAnnualPeriod(annual, latest, 1)?.period ?? null;
  if (!latest || !prior) return "Comparable latest and prior annual periods are required for FCF growth.";
  const latestFcf = deriveSimpleFreeCashFlow(latest);
  const priorFcf = deriveSimpleFreeCashFlow(prior);
  if (!isFiniteNumber(latestFcf) || !isFiniteNumber(priorFcf)) {
    return "Annual free cash flow is missing for the latest or prior annual period.";
  }
  if (priorFcf <= 0) return "FCF growth is not meaningful when prior-year FCF is non-positive.";
  return undefined;
}

function fcfGrowthMissingReason(input: FinancialAnalysisInput, metrics: FinancialMetrics): string | undefined {
  if (metrics.growth.freeCashFlowGrowthBasis !== "TTM_YOY") return annualFcfGrowthMissingReason(input);
  const latestFcf = deriveSimpleFreeCashFlow(input.trailingTwelveMonths);
  const priorFcf = deriveSimpleFreeCashFlow(input.priorTrailingTwelveMonths);
  if (!isFiniteNumber(latestFcf) || !isFiniteNumber(priorFcf)) {
    return "Comparable TTM free cash flow is missing for FCF growth.";
  }
  if (priorFcf <= 0) return "FCF growth is not meaningful when prior TTM FCF is non-positive.";
  return undefined;
}

function fcfPerShareCagrMissingReason(input: FinancialAnalysisInput): string | undefined {
  const { latest, prior } = annualEndpointForCagr(input);
  if (!latest || !prior) return "Comparable latest and three-year-prior annual periods are required for FCF/share CAGR.";
  if (!shareBasisComparable(latest, prior)) return "FCF/share CAGR requires comparable split-adjusted share basis at both endpoints.";
  const priorFcf = deriveSimpleFreeCashFlow(prior);
  const latestFcf = deriveSimpleFreeCashFlow(latest);
  if (!isFiniteNumber(priorFcf) || !isFiniteNumber(latestFcf)) {
    return "Annual free cash flow is missing for the latest or three-year-prior annual period.";
  }
  if (!isFiniteNumber(prior.sharesDiluted) || !isFiniteNumber(latest.sharesDiluted)) {
    return "Diluted share count is missing for the latest or three-year-prior annual period.";
  }
  const priorFcfPerShare = safeDivide(priorFcf, prior.sharesDiluted);
  const latestFcfPerShare = safeDivide(latestFcf, latest.sharesDiluted);
  if (!isFiniteNumber(priorFcfPerShare) || !isFiniteNumber(latestFcfPerShare)) {
    return "FCF/share CAGR requires non-zero diluted share counts at both endpoints.";
  }
  if (priorFcfPerShare <= 0 || latestFcfPerShare <= 0) {
    return "FCF/share CAGR is not meaningful when FCF/share is non-positive at either endpoint.";
  }
  return undefined;
}

function commonEarnings(period: FinancialPeriod | null | undefined): number | null {
  return firstFinite(period?.netIncomeCommonStockholders, period?.netIncome);
}

function ebitdaForValuation(period: FinancialPeriod | null | undefined): number | null {
  if (!period) return null;
  return firstFinite(
    period.ebitda,
    isFiniteNumber(period.operatingIncome) && isFiniteNumber(period.depreciationAndAmortization)
      ? period.operatingIncome + period.depreciationAndAmortization
      : null,
  );
}

function priceEarningsMissingReason(metrics: FinancialMetrics): string | undefined {
  const earnings = commonEarnings(metrics.latestPeriod);
  if (!isFiniteNumber(earnings)) return "P/E requires net income available to common shareholders for the selected valuation period.";
  if (earnings <= 0) return "P/E is not meaningful when common earnings are non-positive.";
  if (!isFiniteNumber(metrics.valuation.marketCap)) return "P/E requires a current same-currency market cap.";
  return undefined;
}

function evEbitdaMissingReason(metrics: FinancialMetrics): string | undefined {
  const ebitda = ebitdaForValuation(metrics.latestPeriod);
  if (!isFiniteNumber(ebitda)) return "EV / EBITDA requires EBITDA for the selected valuation period.";
  if (ebitda <= 0) return "EV / EBITDA is not meaningful when EBITDA is non-positive.";
  if (!isFiniteNumber(metrics.valuation.enterpriseValue)) {
    return "EV / EBITDA requires enterprise value from current market cap plus reported debt and cash, or provider-reported EV.";
  }
  return undefined;
}

function previousAnnualPeriod(input: FinancialAnalysisInput): FinancialPeriod | null {
  const annual = sortFinancialPeriods(input.annualPeriods);
  const latest = annual.at(-1) ?? null;
  return comparableAnnualPeriod(annual, latest, 1)?.period ?? null;
}

function returnPeriodPair(input: FinancialAnalysisInput, metrics: FinancialMetrics, periodBasis: string | undefined): {
  latest: FinancialPeriod | null;
  prior: FinancialPeriod | null;
} {
  const useTtmReturn = Boolean(periodBasis && periodBasis !== "FY");
  return {
    latest: useTtmReturn ? metrics.latestPeriod : latestAnnualPeriod(input),
    prior: useTtmReturn ? input.priorTrailingTwelveMonths ?? null : previousAnnualPeriod(input),
  };
}

function investedCapitalMissingReason(period: FinancialPeriod | null, label: string): string | undefined {
  if (!period) return `${label} invested capital requires a comparable financial period.`;
  const debt = period.totalDebt;
  const equity = period.totalEquity;
  const cash = period.cashAndEquivalents;
  const missing = [
    !isFiniteNumber(debt) ? "debt" : null,
    !isFiniteNumber(equity) ? "equity" : null,
    !isFiniteNumber(cash) ? "cash" : null,
  ].filter((item): item is string => Boolean(item));
  if (missing.length || !isFiniteNumber(debt) || !isFiniteNumber(equity) || !isFiniteNumber(cash)) {
    return `${label} invested capital requires reported ${missing.join(", ")}.`;
  }
  const investedCapital = debt + equity - cash;
  if (investedCapital <= 0) return `${label} invested capital must be positive for ROIC.`;
  return undefined;
}

function roicMissingReason(input: FinancialAnalysisInput, metrics: FinancialMetrics): string | undefined {
  const { latest, prior } = returnPeriodPair(input, metrics, metrics.provenance.returnOnInvestedCapital?.periodBasis);
  if (!latest) return "ROIC requires a selected return period.";
  if (!isFiniteNumber(latest.operatingIncome)) return "ROIC requires operating income for the selected return period.";
  if (!prior) return "ROIC requires a comparable prior annual or TTM balance-sheet period for average invested capital.";
  return investedCapitalMissingReason(latest, "Current")
    ?? investedCapitalMissingReason(prior, "Prior comparable");
}

function returnOnAssetsMissingReason(input: FinancialAnalysisInput, metrics: FinancialMetrics): string | undefined {
  const { latest, prior } = returnPeriodPair(input, metrics, metrics.provenance.returnOnAssets?.periodBasis);
  if (!latest) return "ROA requires a selected return period.";
  if (!isFiniteNumber(latest.netIncome)) return "ROA requires reported net income for the selected return period.";
  if (!prior) return "ROA requires a comparable prior annual or TTM balance-sheet period for average assets.";
  if (!isFiniteNumber(latest.totalAssets)) return "ROA requires reported current assets.";
  if (!isFiniteNumber(prior.totalAssets)) return "ROA requires reported prior comparable assets.";
  if (latest.totalAssets <= 0 || prior.totalAssets <= 0) return "ROA requires positive current and prior comparable assets.";
  return undefined;
}

function returnOnEquityMissingReason(input: FinancialAnalysisInput, metrics: FinancialMetrics): string | undefined {
  const { latest, prior } = returnPeriodPair(input, metrics, metrics.provenance.returnOnEquity?.periodBasis);
  if (!latest) return "ROE requires a selected return period.";
  if (!isFiniteNumber(latest.netIncome)) return "ROE requires reported net income for the selected return period.";
  if (!prior) return "ROE requires a comparable prior annual or TTM balance-sheet period for average equity.";
  if (!isFiniteNumber(latest.totalEquity)) return "ROE requires reported current equity.";
  if (!isFiniteNumber(prior.totalEquity)) return "ROE requires reported prior comparable equity.";
  if (latest.totalEquity <= 0 || prior.totalEquity <= 0) return "ROE requires positive current and prior comparable equity.";
  return undefined;
}

function accrualRatioMissingReason(input: FinancialAnalysisInput, metrics: FinancialMetrics): string | undefined {
  const { latest, prior } = returnPeriodPair(input, metrics, metrics.provenance.accrualRatio?.periodBasis);
  if (!latest) return "Accrual ratio requires a selected earnings-quality period.";
  if (!isFiniteNumber(latest.netIncome)) return "Accrual ratio requires reported net income for the selected period.";
  if (!isFiniteNumber(latest.operatingCashFlow)) return "Accrual ratio requires reported operating cash flow for the selected period.";
  if (!prior) return "Accrual ratio requires a comparable prior annual or TTM balance-sheet period for average assets.";
  if (!isFiniteNumber(latest.totalAssets)) return "Accrual ratio requires reported current assets.";
  if (!isFiniteNumber(prior.totalAssets)) return "Accrual ratio requires reported prior comparable assets.";
  if (latest.totalAssets <= 0 || prior.totalAssets <= 0) return "Accrual ratio requires positive current and prior comparable assets.";
  return undefined;
}

function marginMissingReason(label: string, numeratorLabel: string, numerator: number | null | undefined, revenue: number | null | undefined): string | undefined {
  if (!isFiniteNumber(revenue)) return `${label} requires reported revenue for the selected period.`;
  if (revenue === 0) return `${label} is not finite when reported revenue is zero.`;
  if (!isFiniteNumber(numerator)) return `${label} requires reported ${numeratorLabel} for the selected period.`;
  return undefined;
}

function revenueCagrMissingReason(input: FinancialAnalysisInput, targetYears: number): string | undefined {
  const annual = sortFinancialPeriods(input.annualPeriods);
  const latest = annual.at(-1) ?? null;
  const prior = comparableAnnualPeriod(annual, latest, targetYears)?.period ?? null;
  const label = `Revenue CAGR ${targetYears}Y`;
  if (!latest || !prior) return `${label} requires comparable latest and ${targetYears === 3 ? "three" : "five"}-year-prior annual periods.`;
  if (!isFiniteNumber(latest.revenue) || !isFiniteNumber(prior.revenue)) {
    return `${label} requires reported revenue at both annual endpoints.`;
  }
  if (latest.revenue <= 0 || prior.revenue <= 0) return `${label} is not meaningful when revenue is non-positive at either endpoint.`;
  return undefined;
}

function revenueGrowthMissingReason(input: FinancialAnalysisInput, metrics: FinancialMetrics): string | undefined {
  const latest = metrics.growth.revenueGrowthBasis === "TTM_YOY"
    ? input.trailingTwelveMonths ?? null
    : latestAnnualPeriod(input);
  const prior = metrics.growth.revenueGrowthBasis === "TTM_YOY"
    ? input.priorTrailingTwelveMonths ?? null
    : previousAnnualPeriod(input);
  if (!latest || !prior) return "Revenue growth requires comparable latest and prior annual or TTM periods.";
  if (!isFiniteNumber(latest.revenue) || !isFiniteNumber(prior.revenue)) {
    return "Revenue growth requires reported revenue in both comparable periods.";
  }
  if (prior.revenue <= 0) return "Revenue growth is not meaningful when prior-period revenue is non-positive.";
  return undefined;
}

function simpleFcfMissingReason(label: string): string {
  return `${label} requires operating cash flow and capex, or provider-reported free cash flow, for the selected cash-flow period.`;
}

function fcfYieldMissingReason(metrics: FinancialMetrics): string | undefined {
  if (!isFiniteNumber(metrics.cashFlow.simpleFreeCashFlow)) return simpleFcfMissingReason("FCF yield");
  if (!isFiniteNumber(metrics.valuation.marketCap) || metrics.valuation.marketCap <= 0) {
    return "FCF yield requires a current same-currency market cap.";
  }
  return undefined;
}

function cashFlowMarginMissingReason(
  label: string,
  valueLabel: string,
  value: number | null | undefined,
  revenue: number | null | undefined,
): string | undefined {
  if (!isFiniteNumber(revenue)) return `${label} requires reported revenue for the selected cash-flow period.`;
  if (revenue === 0) return `${label} is not finite when reported revenue is zero.`;
  if (!isFiniteNumber(value)) return `${label} requires reported ${valueLabel} for the selected cash-flow period.`;
  return undefined;
}

function stabilityMissingReason(label: string, inputs: string[]): string {
  return `${label} requires at least three contiguous annual periods with ${inputs.join(" and ")}.`;
}

function marginStabilityMissingReason(
  input: FinancialAnalysisInput,
  label: string,
  numeratorLabel: string,
  numerator: keyof FinancialPeriod,
): string | undefined {
  const available = contiguousAnnualHistory(input.annualPeriods)
    .filter((period) => isFiniteNumber(period[numerator]) && isFiniteNumber(period.revenue) && period.revenue !== 0);
  return available.length >= 3 ? undefined : stabilityMissingReason(label, [`reported ${numeratorLabel}`, "reported revenue"]);
}

function fcfStabilityMissingReason(input: FinancialAnalysisInput): string | undefined {
  const available = contiguousAnnualHistory(input.annualPeriods).filter((period) => isFiniteNumber(deriveSimpleFreeCashFlow(period)));
  return available.length >= 3 ? undefined : stabilityMissingReason("FCF stability", ["operating cash flow and capex or reported free cash flow"]);
}

function shareDilutionMissingReason(input: FinancialAnalysisInput): string | undefined {
  const annual = sortFinancialPeriods(input.annualPeriods);
  const latest = annual.at(-1) ?? null;
  const prior = comparableAnnualPeriod(annual, latest, 1)?.period ?? null;
  if (!latest || !prior) return "Share dilution requires comparable latest and prior annual periods.";
  if (!shareBasisComparable(latest, prior)) return "Share dilution requires comparable split-adjusted share basis.";
  if (!isFiniteNumber(latest.sharesDiluted) || !isFiniteNumber(prior.sharesDiluted)) {
    return "Share dilution requires diluted share counts in both comparable annual periods.";
  }
  if (prior.sharesDiluted <= 0) return "Share dilution is not finite when prior-year diluted shares are zero or negative.";
  return undefined;
}

function balanceRatioMissingReason(label: string, numeratorLabel: string, numerator: number | null | undefined, denominatorLabel: string, denominator: number | null | undefined): string | undefined {
  if (!isFiniteNumber(denominator)) return `${label} requires reported ${denominatorLabel}.`;
  if (denominator === 0) return `${label} is not finite when reported ${denominatorLabel} is zero.`;
  if (!isFiniteNumber(numerator)) return `${label} requires reported ${numeratorLabel}.`;
  return undefined;
}

function evSalesMissingReason(metrics: FinancialMetrics): string | undefined {
  const revenue = metrics.latestPeriod?.revenue;
  if (!isFiniteNumber(revenue)) return "EV / Sales requires reported revenue for the selected valuation period.";
  if (revenue <= 0) return "EV / Sales is not meaningful when revenue is non-positive.";
  if (!isFiniteNumber(metrics.valuation.enterpriseValue)) {
    return "EV / Sales requires enterprise value from current market cap plus reported debt and cash, or provider-reported EV.";
  }
  return undefined;
}

function netIncomeConversionMissingReason(
  label: string,
  numeratorLabel: string,
  numerator: number | null | undefined,
  netIncome: number | null | undefined,
): string | undefined {
  if (!isFiniteNumber(netIncome)) return `${label} requires reported net income for the selected period.`;
  if (netIncome === 0) return `${label} is not finite when reported net income is zero.`;
  if (!isFiniteNumber(numerator)) return `${label} requires reported ${numeratorLabel} for the selected period.`;
  return undefined;
}

function pricePerformanceMissingReason(label: string): string {
  return `${label} requires sufficient market price history from the configured market-data provider.`;
}

function betaMissingReason(): string {
  return "Beta requires sufficient overlapping price history against the configured benchmark.";
}

function growthPlusFcfMissingReason(metrics: FinancialMetrics): string | undefined {
  if (!isFiniteNumber(metrics.growth.revenueGrowthYoY) && !isFiniteNumber(metrics.margins.freeCashFlowMargin)) {
    return "Growth + FCF margin requires both revenue growth and free-cash-flow margin.";
  }
  if (!isFiniteNumber(metrics.growth.revenueGrowthYoY)) return "Growth + FCF margin requires revenue growth.";
  if (!isFiniteNumber(metrics.margins.freeCashFlowMargin)) return "Growth + FCF margin requires free-cash-flow margin.";
  return undefined;
}

function sbcToRevenueMissingReason(metrics: FinancialMetrics): string | undefined {
  const period = metrics.latestPeriod;
  if (!period || !isFiniteNumber(period.revenue)) return "SBC / revenue requires reported revenue for the selected period.";
  if (period.revenue === 0) return "SBC / revenue is not finite when reported revenue is zero.";
  if (!isFiniteNumber(period.stockBasedCompensation)) return "SBC / revenue requires reported stock-based compensation.";
  return undefined;
}

const specializedRequiredFields: Partial<Record<AnalysisArchetype, string[]>> = {
  bank: [
    "netInterestIncome", "netInterestMargin", "grossLoans", "deposits", "depositGrowth",
    "netInterestIncomeGrowth", "grossLoanGrowth", "cet1CapitalRatio", "tangibleCommonEquity", "tangibleBookValuePerShare",
    "nonPerformingLoans", "netChargeOffs", "loanLossProvisions", "efficiencyRatio",
    "returnOnAssets", "returnOnEquity", "returnOnTangibleCommonEquity",
  ],
  reit: [
    "fundsFromOperations", "fundsFromOperationsPerShare", "adjustedFundsFromOperations",
    "adjustedFundsFromOperationsPerShare", "fundsFromOperationsGrowth",
    "adjustedFundsFromOperationsGrowth", "adjustedFundsFromOperationsPayout",
    "dividendCoverage", "occupancy", "sameStoreNoiGrowth", "netDebtToEbitdare",
    "debtMaturities", "fixedChargeCoverage", "netAssetValue",
  ],
};

function specializedRequiredFieldsFor(
  archetype: AnalysisArchetype,
  company: FinancialAnalysisInput["company"],
): string[] | undefined {
  if (archetype === "insurer") {
    return insurerRequiredFields(company);
  }
  return specializedRequiredFields[archetype];
}

function specializedCoverageFor(
  archetype: AnalysisArchetype,
  company: FinancialAnalysisInput["company"],
  specialized?: SpecializedCompanyData,
): SpecializedCoverage | undefined {
  const required = specializedRequiredFieldsFor(archetype, company);
  if (!required) return undefined;
  const values = specialized?.kind === archetype
    ? specialized as unknown as Record<string, { value?: number | null }>
    : {};
  const available = required.filter((field) => isFiniteNumber(values[field]?.value));
  return {
    overall: required.length ? available.length / required.length : 0,
    required,
    available,
    missing: required.filter((field) => !available.includes(field)),
    ...(archetype === "insurer" ? { insurerSubtype: resolveInsurerSubtype(company) } : {}),
  };
}

function specializedValue(metric: { value?: number | null } | null | undefined): number | null {
  return isFiniteNumber(metric?.value) ? metric.value : null;
}

function specializedInputMissingReason(label: string, inputs: string[], archetype: string): string {
  return `${label} requires ${inputs.join(", ")} from specialized ${archetype} data; operating-company substitutes are not used.`;
}

function bookMultipleMissingReason(
  label: string,
  metrics: FinancialMetrics,
  bookValue: number | null | undefined,
  bookValueLabel: string,
): string | undefined {
  if (!isFiniteNumber(bookValue)) return `${label} requires reported ${bookValueLabel}.`;
  if (bookValue <= 0) return `${label} is not meaningful when ${bookValueLabel} is non-positive.`;
  if (!isFiniteNumber(metrics.valuation.marketCap)) return `${label} requires a current same-currency market cap.`;
  return undefined;
}

function standardDimensions(input: FinancialAnalysisInput, metrics: FinancialMetrics): Record<ScoreDimensionKey, ScoreDimension> {
  const b = benchmarksForSector(input.company.sector);
  const m = metrics;
  const latestPeriod = m.latestPeriod?.periodEndDate;
  const c = (label: string, value: number | null, score: number | null, weight: number, missingReason?: string) =>
    contributor({ label, value, score, weight, period: latestPeriod, missingReason });
  const cp = (label: string, value: number | null, score: number | null, weight: number, provenanceKey: string, missingReason?: string) => {
    const provenance = m.provenance[provenanceKey];
    return contributor({
      label,
      value,
      score,
      weight,
      source: provenance?.source ?? "canonical financial metrics",
      period: provenance?.periodEnd ?? latestPeriod,
      missingReason,
    });
  };
  const revenueGrowthLabel = m.growth.revenueGrowthBasis === "TTM_YOY" ? "Revenue growth TTM YoY" : "Revenue growth annual YoY";
  const fcfGrowthLabel = m.growth.freeCashFlowGrowthBasis === "TTM_YOY" ? "FCF growth TTM YoY" : "FCF growth annual YoY";
  return {
    growth: dimension("growth", [
      c(revenueGrowthLabel, m.growth.revenueGrowthYoY, scoreHigherIsBetter(m.growth.revenueGrowthYoY, b.revenueGrowthWeak, b.revenueGrowthStrong), 0.3, revenueGrowthMissingReason(input, m)),
      c("Revenue CAGR 3Y", m.growth.revenueCagr3y, scoreHigherIsBetter(m.growth.revenueCagr3y, 0, b.revenueGrowthStrong), 0.3, revenueCagrMissingReason(input, 3)),
      c("EPS CAGR 3Y", m.growth.epsCagr3y, scoreHigherIsBetter(m.growth.epsCagr3y, -0.03, 0.18), 0.2, epsCagrMissingReason(input)),
      c("FCF/share CAGR 3Y", m.growth.freeCashFlowPerShareCagr3y, scoreHigherIsBetter(m.growth.freeCashFlowPerShareCagr3y, -0.03, 0.15), 0.2, fcfPerShareCagrMissingReason(input)),
    ], "Growth requires both breadth and durability; one isolated metric cannot carry the dimension."),
    profitability: dimension("profitability", [
      c("Gross margin", m.margins.grossMargin, scoreHigherIsBetter(m.margins.grossMargin, b.grossMarginWeak, b.grossMarginStrong), 0.2, marginMissingReason("Gross margin", "gross profit", m.latestPeriod?.grossProfit, m.latestPeriod?.revenue)),
      c("Operating margin", m.margins.operatingMargin, scoreHigherIsBetter(m.margins.operatingMargin, b.operatingMarginWeak, b.operatingMarginStrong), 0.3, marginMissingReason("Operating margin", "operating income", m.latestPeriod?.operatingIncome, m.latestPeriod?.revenue)),
      c("Net margin", m.margins.netMargin, scoreHigherIsBetter(m.margins.netMargin, b.netMarginWeak, b.netMarginStrong), 0.2, marginMissingReason("Net margin", "net income", m.latestPeriod?.netIncome, m.latestPeriod?.revenue)),
      cp("ROIC", m.ratios.returnOnInvestedCapital, scoreHigherIsBetter(m.ratios.returnOnInvestedCapital, b.roicWeak, b.roicStrong), 0.3, "returnOnInvestedCapital", roicMissingReason(input, m)),
    ], "Margins and average-capital returns measure operating economics."),
    financialHealth: dimension("financialHealth", [
      cp("Net debt / EBITDA", m.ratios.netDebtToEbitda, scoreLowerIsBetter(m.ratios.netDebtToEbitda, b.netDebtToEbitdaWeak, b.netDebtToEbitdaStrong), 0.35, "netDebtToEbitda", netDebtToEbitdaMissingReason(input, m)),
      cp("Interest coverage", m.ratios.interestCoverage, scoreHigherIsBetter(m.ratios.interestCoverage, b.interestCoverageWeak, b.interestCoverageStrong), 0.3, "interestCoverage", interestCoverageMissingReason(input, m)),
      cp("Cash / debt", m.ratios.cashToDebt, scoreHigherIsBetter(m.ratios.cashToDebt, 0.1, 1), 0.2, "cashToDebt", cashToDebtMissingReason(input, m)),
      cp("Current ratio", m.ratios.currentRatio, scoreTargetRange(m.ratios.currentRatio, 0.5, 1.2, 3, 6), 0.15, "currentRatio", balanceRatioMissingReason("Current ratio", "current assets", m.latestPeriod?.currentAssets, "current liabilities", m.latestPeriod?.currentLiabilities)),
    ], "Only reported same-period balance-sheet and flow values are used; incomplete TTM ratios can fall back to a fully annual basis, and missing debt or cash is never treated as zero."),
    valuation: dimension("valuation", [
      cp("P/E", m.valuation.priceEarnings, scoreLowerIsBetter(m.valuation.priceEarnings, b.peExpensive, b.peAttractive), 0.25, "priceEarnings", priceEarningsMissingReason(m)),
      cp("EV / EBITDA", m.valuation.evEbitda, scoreLowerIsBetter(m.valuation.evEbitda, b.evEbitdaExpensive, b.evEbitdaAttractive), 0.25, "evEbitda", evEbitdaMissingReason(m)),
      cp("EV / Sales", m.valuation.evSales, scoreLowerIsBetter(m.valuation.evSales, b.evSalesExpensive, b.evSalesAttractive), 0.15, "evSales", evSalesMissingReason(m)),
      cp("FCF yield", m.valuation.freeCashFlowYield, scoreHigherIsBetter(m.valuation.freeCashFlowYield, b.fcfYieldWeak, b.fcfYieldStrong), 0.35, "freeCashFlowYield", fcfYieldMissingReason(m)),
    ], `Valuation uses ${STATIC_BENCHMARK_VERSION}; live peers are not implied.`),
    cashFlow: dimension("cashFlow", [
      cp("Simple FCF margin", m.margins.freeCashFlowMargin, scoreHigherIsBetter(m.margins.freeCashFlowMargin, -0.02, 0.18), 0.3, "freeCashFlowMargin", cashFlowMarginMissingReason("Simple FCF margin", "operating cash flow and capex or provider-reported free cash flow", m.cashFlow.simpleFreeCashFlow, m.latestPeriod?.revenue)),
      cp("CFO margin", m.margins.operatingCashFlowMargin, scoreHigherIsBetter(m.margins.operatingCashFlowMargin, 0, 0.2), 0.25, "operatingCashFlowMargin", cashFlowMarginMissingReason("CFO margin", "operating cash flow", m.latestPeriod?.operatingCashFlow, m.latestPeriod?.revenue)),
      cp(fcfGrowthLabel, m.growth.freeCashFlowGrowthYoY, scoreHigherIsBetter(m.growth.freeCashFlowGrowthYoY, -0.15, 0.2), 0.2, "freeCashFlowGrowthYoY", fcfGrowthMissingReason(input, m)),
      cp("FCF / net income", m.cashFlow.freeCashFlowToNetIncome, scoreTargetRange(m.cashFlow.freeCashFlowToNetIncome, 0, 0.8, 1.4, 2.5), 0.25, "freeCashFlowToNetIncome", netIncomeConversionMissingReason("FCF / net income", "simple free cash flow", m.cashFlow.simpleFreeCashFlow, m.latestPeriod?.netIncome)),
    ], "Cash generation, growth and accounting conversion are scored separately; incomplete TTM cash-flow inputs can fall back to one complete annual basis."),
    earningsQuality: dimension("earningsQuality", [
      cp("CFO / net income", m.cashFlow.cfoToNetIncome, scoreTargetRange(m.cashFlow.cfoToNetIncome, 0, 0.85, 1.5, 3), 0.35, "cfoToNetIncome", netIncomeConversionMissingReason("CFO / net income", "operating cash flow", m.latestPeriod?.operatingCashFlow, m.latestPeriod?.netIncome)),
      cp("Accrual ratio", m.cashFlow.accrualRatio, scoreLowerIsBetter(m.cashFlow.accrualRatio, 0.15, -0.05), 0.25, "accrualRatio", accrualRatioMissingReason(input, m)),
      c("Operating margin stability", m.cashFlow.operatingMarginStability, scoreHigherIsBetter(m.cashFlow.operatingMarginStability, 0.3, 0.9), 0.2, marginStabilityMissingReason(input, "Operating margin stability", "operating income", "operatingIncome")),
      c("FCF stability", m.cashFlow.freeCashFlowStability, scoreHigherIsBetter(m.cashFlow.freeCashFlowStability, 0.2, 0.85), 0.2, fcfStabilityMissingReason(input)),
    ], "Cash support, accruals and multi-period stability determine accounting quality."),
    quality: dimension("quality", [
      cp("ROIC", m.ratios.returnOnInvestedCapital, scoreHigherIsBetter(m.ratios.returnOnInvestedCapital, b.roicWeak, b.roicStrong), 0.35, "returnOnInvestedCapital", roicMissingReason(input, m)),
      cp("ROA", m.ratios.returnOnAssets, scoreHigherIsBetter(m.ratios.returnOnAssets, b.roaWeak, b.roaStrong), 0.2, "returnOnAssets", returnOnAssetsMissingReason(input, m)),
      c("Gross margin stability", m.cashFlow.grossMarginStability, scoreHigherIsBetter(m.cashFlow.grossMarginStability, 0.3, 0.9), 0.2, marginStabilityMissingReason(input, "Gross margin stability", "gross profit", "grossProfit")),
      c("Share dilution", m.trends.sharesDilutionYoY, scoreLowerIsBetter(m.trends.sharesDilutionYoY, 0.08, -0.02), 0.25, shareDilutionMissingReason(input)),
    ], "Capital efficiency, durability and per-share discipline form the quality composite."),
    momentum: dimension("momentum", [
      c("Price performance 3M", input.market?.pricePerformance?.threeMonth ?? null, scoreHigherIsBetter(input.market?.pricePerformance?.threeMonth ?? null, -0.2, 0.25), 0.4, pricePerformanceMissingReason("Price performance 3M")),
      c("Price performance 1Y", input.market?.pricePerformance?.oneYear ?? null, scoreHigherIsBetter(input.market?.pricePerformance?.oneYear ?? null, -0.35, 0.45), 0.6, pricePerformanceMissingReason("Price performance 1Y")),
    ], "Price momentum is a limited context signal and never changes the underlying facts."),
    risk: dimension("risk", [
      c("Beta", input.market?.beta ?? null, scoreLowerIsBetter(input.market?.beta ?? null, b.betaHighRisk, b.betaLowRisk), 0.35, betaMissingReason()),
      c("Interest coverage", m.ratios.interestCoverage, scoreHigherIsBetter(m.ratios.interestCoverage, 1.5, 8), 0.35, interestCoverageMissingReason(input, m)),
      c("Equity / assets", m.ratios.equityToAssets, scoreHigherIsBetter(m.ratios.equityToAssets, 0.1, 0.55), 0.3, balanceRatioMissingReason("Equity / assets", "equity", m.latestPeriod?.totalEquity, "assets", m.latestPeriod?.totalAssets)),
    ], "Market sensitivity and balance-sheet resilience provide a bounded risk context."),
  };
}

function unknownArchetypeDimensions(input: FinancialAnalysisInput, metrics: FinancialMetrics): Record<ScoreDimensionKey, ScoreDimension> {
  const dimensions = standardDimensions(input, metrics);
  const b = benchmarksForSector(input.company.sector);
  const latestPeriod = metrics.latestPeriod?.periodEndDate;
  const rationale = input.company.classificationDiagnostics?.confidence
    ? "The available evidence identifies a specialist or unresolved company type; StockBox withholds operating-company scoring until an appropriate archetype model is available."
    : "The available evidence is insufficient to choose an economically suitable scoring model.";
  const missingReason = input.company.classificationDiagnostics?.reason ?? rationale;
  const c = (label: string, value: number | null, score: number | null, weight: number) =>
    contributor({ label, value, score, weight, period: latestPeriod, missingReason });
  return {
    ...dimensions,
    growth: dimension("growth", [
      c("Archetype-specific growth model", null, null, 1),
    ], rationale),
    profitability: dimension("profitability", [
      c("Archetype-specific profitability model", null, null, 1),
    ], rationale),
    financialHealth: dimension("financialHealth", [
      c("Archetype-specific financial-health model", null, null, 1),
    ], rationale),
    valuation: dimension("valuation", [
      c("Archetype-specific valuation model", null, null, 1),
    ], rationale),
    cashFlow: dimension("cashFlow", [
      c("Archetype-specific cash-flow model", null, null, 1),
    ], rationale),
    earningsQuality: dimension("earningsQuality", [
      c("Archetype-specific earnings-quality model", null, null, 1),
    ], rationale),
    quality: dimension("quality", [
      c("Archetype-specific quality model", null, null, 1),
    ], rationale),
    risk: dimension("risk", [
      c("Beta", input.market?.beta ?? null, scoreLowerIsBetter(input.market?.beta ?? null, b.betaHighRisk, b.betaLowRisk), 1),
    ], "For unresolved archetypes, only broad market sensitivity is retained as a comparable risk signal."),
  };
}

function shouldUseUnknownArchetypeDimensions(input: FinancialAnalysisInput): boolean {
  const classification = input.company.classificationDiagnostics;
  return input.company.sector === "financials"
    || input.company.sector === "realEstate"
    || Boolean(classification && (classification.ambiguous || classification.confidence >= 0.6));
}

function archetypeDimensions(
  input: FinancialAnalysisInput,
  metrics: FinancialMetrics,
  archetype: AnalysisArchetype,
): Record<ScoreDimensionKey, ScoreDimension> {
  const dimensions = standardDimensions(input, metrics);
  const latest = metrics.latestPeriod;
  const period = latest?.periodEndDate;
  const c = (label: string, value: number | null, score: number | null, weight: number, unsuitable = false, missingReason?: string) =>
    contributor({ label, value, score, weight, period, unsuitable, missingReason });

  if (archetype === "unknown" && shouldUseUnknownArchetypeDimensions(input)) {
    return unknownArchetypeDimensions(input, metrics);
  }

  if (archetype === "bank") {
    const bank = input.specialized?.kind === "bank" ? input.specialized : null;
    const netInterestMargin = specializedValue(bank?.netInterestMargin);
    const bankRoa = specializedValue(bank?.returnOnAssets);
    const bankRoe = specializedValue(bank?.returnOnEquity);
    const efficiencyRatio = specializedValue(bank?.efficiencyRatio);
    const cet1 = specializedValue(bank?.cet1CapitalRatio);
    const grossLoans = specializedValue(bank?.grossLoans);
    const deposits = specializedValue(bank?.deposits);
    const nonPerformingLoans = specializedValue(bank?.nonPerformingLoans);
    const netChargeOffs = specializedValue(bank?.netChargeOffs);
    const tangibleBookValuePerShare = specializedValue(bank?.tangibleBookValuePerShare);
    const tangibleCommonEquity = specializedValue(bank?.tangibleCommonEquity);
    const depositGrowth = specializedValue(bank?.depositGrowth);
    const netInterestIncomeGrowth = specializedValue(bank?.netInterestIncomeGrowth);
    const grossLoanGrowth = specializedValue(bank?.grossLoanGrowth);
    const returnOnTangibleCommonEquity = specializedValue(bank?.returnOnTangibleCommonEquity);
    const loanLossProvisions = specializedValue(bank?.loanLossProvisions);
    const nonPerformingLoanRatio = isFiniteNumber(nonPerformingLoans) && isFiniteNumber(grossLoans) && grossLoans !== 0
      ? nonPerformingLoans / grossLoans
      : null;
    const netChargeOffRatio = isFiniteNumber(netChargeOffs) && isFiniteNumber(grossLoans) && grossLoans !== 0
      ? netChargeOffs / grossLoans
      : null;
    const depositFundingRatio = isFiniteNumber(deposits) && isFiniteNumber(grossLoans) && grossLoans !== 0
      ? deposits / grossLoans
      : null;
    const priceTangibleBook = isFiniteNumber(input.market?.price) && isFiniteNumber(tangibleBookValuePerShare)
      && tangibleBookValuePerShare > 0
      ? input.market.price / tangibleBookValuePerShare
      : isFiniteNumber(metrics.valuation.marketCap) && isFiniteNumber(tangibleCommonEquity)
        && tangibleCommonEquity > 0
        ? metrics.valuation.marketCap / tangibleCommonEquity
        : null;
    dimensions.profitability = dimension("profitability", [
      c("Net interest margin", netInterestMargin, scoreHigherIsBetter(netInterestMargin, 0.015, 0.04), 0.3, false, specializedInputMissingReason("Net interest margin", ["reported NIM"], "bank")),
      c("Return on assets", bankRoa, scoreHigherIsBetter(bankRoa, 0.003, 0.018), 0.25, false, specializedInputMissingReason("Return on assets", ["bank net income", "average assets"], "bank")),
      c("Return on equity", bankRoe, scoreHigherIsBetter(bankRoe, 0.05, 0.18), 0.25, false, specializedInputMissingReason("Return on equity", ["bank net income", "average equity"], "bank")),
      c("Efficiency ratio", efficiencyRatio, scoreLowerIsBetter(efficiencyRatio, 0.75, 0.45), 0.2, false, specializedInputMissingReason("Efficiency ratio", ["net interest income", "noninterest income", "noninterest expense"], "bank")),
    ], "Reported banking margins, returns and operating efficiency determine profitability coverage.");
    dimensions.financialHealth = dimension("financialHealth", [
      c("CET1 capital ratio", cet1, scoreHigherIsBetter(cet1, 0.07, 0.15), 0.35, false, specializedInputMissingReason("CET1 capital ratio", ["reported CET1 capital ratio"], "bank")),
      c("Nonperforming loans / gross loans", nonPerformingLoanRatio, scoreLowerIsBetter(nonPerformingLoanRatio, 0.05, 0.01), 0.2, false, specializedInputMissingReason("Nonperforming loans / gross loans", ["nonperforming loans", "gross loans"], "bank")),
      c("Net charge-offs / gross loans", netChargeOffRatio, scoreLowerIsBetter(netChargeOffRatio, 0.025, 0.003), 0.15, false, specializedInputMissingReason("Net charge-offs / gross loans", ["net charge-offs", "gross loans"], "bank")),
      c("Deposits / gross loans", depositFundingRatio, scoreHigherIsBetter(depositFundingRatio, 0.65, 1.1), 0.15, false, specializedInputMissingReason("Deposits / gross loans", ["deposits", "gross loans"], "bank")),
      c("Equity / assets", metrics.ratios.equityToAssets, scoreHigherIsBetter(metrics.ratios.equityToAssets, 0.04, 0.12), 0.15, false, balanceRatioMissingReason("Equity / assets", "equity", metrics.latestPeriod?.totalEquity, "assets", metrics.latestPeriod?.totalAssets)),
    ], "Regulatory capital, asset quality and deposit funding are required; corporate current ratios are not substituted.");
    dimensions.cashFlow = dimension("cashFlow", [c("Corporate FCF", null, null, 1, true)], "Corporate free cash flow is not a valid primary measure for this archetype.");
    dimensions.valuation = dimension("valuation", [
      c("P / Tangible Book", priceTangibleBook, scoreLowerIsBetter(priceTangibleBook, 3, 0.8), 0.4, false, specializedInputMissingReason("P / Tangible Book", ["price", "tangible book value per share or tangible common equity"], "bank")),
      c("P / Book", metrics.valuation.priceBook, scoreLowerIsBetter(metrics.valuation.priceBook, 3, 0.8), 0.3, false, bookMultipleMissingReason("P / Book", metrics, metrics.latestPeriod?.totalEquity, "book equity")),
      c("P / E", metrics.valuation.priceEarnings, scoreLowerIsBetter(metrics.valuation.priceEarnings, 24, 9), 0.3, false, priceEarningsMissingReason(metrics)),
    ], "Equity-oriented bank multiples require reported tangible book inputs.");
    const provisionRatio = isFiniteNumber(loanLossProvisions) && isFiniteNumber(grossLoans) && grossLoans !== 0
      ? loanLossProvisions / grossLoans
      : null;
    dimensions.growth = dimension("growth", [
      c("Deposit growth", depositGrowth, scoreHigherIsBetter(depositGrowth, -0.05, 0.12), 0.4, false, specializedInputMissingReason("Deposit growth", ["current and prior deposits"], "bank")),
      c("Net interest income growth", netInterestIncomeGrowth, scoreHigherIsBetter(netInterestIncomeGrowth, -0.08, 0.12), 0.3, false, specializedInputMissingReason("Net interest income growth", ["current and prior net interest income"], "bank")),
      c("Gross loan growth", grossLoanGrowth, scoreHigherIsBetter(grossLoanGrowth, -0.08, 0.12), 0.3, false, specializedInputMissingReason("Gross loan growth", ["current and prior gross loans"], "bank")),
    ], "Bank growth requires deposit, loan and net-interest-income growth; unavailable specialist growth is not replaced by corporate FCF or EPS growth.");
    dimensions.earningsQuality = dimension("earningsQuality", [
      c("Nonperforming loans / gross loans", nonPerformingLoanRatio, scoreLowerIsBetter(nonPerformingLoanRatio, 0.05, 0.01), 0.45, false, specializedInputMissingReason("Nonperforming loans / gross loans", ["nonperforming loans", "gross loans"], "bank")),
      c("Net charge-offs / gross loans", netChargeOffRatio, scoreLowerIsBetter(netChargeOffRatio, 0.025, 0.003), 0.35, false, specializedInputMissingReason("Net charge-offs / gross loans", ["net charge-offs", "gross loans"], "bank")),
      c("Loan-loss provisions / gross loans", provisionRatio, scoreTargetRange(provisionRatio, 0, 0.004, 0.025, 0.06), 0.2, false, specializedInputMissingReason("Loan-loss provisions / gross loans", ["loan-loss provisions", "gross loans"], "bank")),
    ], "Bank earnings quality is evaluated through reported asset-quality and credit-loss metrics, not corporate accrual ratios.");
    dimensions.quality = dimension("quality", [
      c("Return on tangible common equity", returnOnTangibleCommonEquity, scoreHigherIsBetter(returnOnTangibleCommonEquity, 0.06, 0.2), 0.45, false, specializedInputMissingReason("Return on tangible common equity", ["bank net income", "average tangible common equity"], "bank")),
      c("Efficiency ratio", efficiencyRatio, scoreLowerIsBetter(efficiencyRatio, 0.75, 0.45), 0.3, false, specializedInputMissingReason("Efficiency ratio", ["net interest income", "noninterest income", "noninterest expense"], "bank")),
      c("Deposits / gross loans", depositFundingRatio, scoreHigherIsBetter(depositFundingRatio, 0.65, 1.1), 0.25, false, specializedInputMissingReason("Deposits / gross loans", ["deposits", "gross loans"], "bank")),
    ], "Bank quality uses tangible-equity returns, operating efficiency and deposit funding rather than industrial ROIC.");
    dimensions.risk = dimension("risk", [
      c("CET1 capital ratio", cet1, scoreHigherIsBetter(cet1, 0.07, 0.15), 0.35, false, specializedInputMissingReason("CET1 capital ratio", ["reported CET1 capital ratio"], "bank")),
      c("Nonperforming loans / gross loans", nonPerformingLoanRatio, scoreLowerIsBetter(nonPerformingLoanRatio, 0.05, 0.01), 0.25, false, specializedInputMissingReason("Nonperforming loans / gross loans", ["nonperforming loans", "gross loans"], "bank")),
      c("Deposits / gross loans", depositFundingRatio, scoreHigherIsBetter(depositFundingRatio, 0.65, 1.1), 0.2, false, specializedInputMissingReason("Deposits / gross loans", ["deposits", "gross loans"], "bank")),
      c("Beta", input.market?.beta ?? null, scoreLowerIsBetter(input.market?.beta ?? null, 1.6, 0.7), 0.2, false, betaMissingReason()),
    ], "Bank risk uses regulatory capital, asset quality, funding resilience and bounded market sensitivity.");
  }

  if (archetype === "insurer") {
    const insurer = input.specialized?.kind === "insurer" ? input.specialized : null;
    const propertyCasualty = isPropertyCasualtyInsurer(input.company);
    const combinedRatio = specializedValue(insurer?.combinedRatio);
    const lossRatio = specializedValue(insurer?.lossRatio);
    const expenseRatio = specializedValue(insurer?.expenseRatio);
    const insurerRoe = specializedValue(insurer?.returnOnEquity);
    const regulatoryCapital = specializedValue(insurer?.regulatoryCapitalRatio);
    const reserveDevelopment = specializedValue(insurer?.reserveDevelopment);
    const premiumGrowth = specializedValue(insurer?.premiumGrowth);
    const insurerBookValue = specializedValue(insurer?.bookValue);
    const insurerTangibleBookValue = specializedValue(insurer?.tangibleBookValue);
    const insurerBookValueForMultiple = firstFinite(insurerBookValue, metrics.latestPeriod?.totalEquity);
    const insurerTangibleBookValueForMultiple = firstFinite(insurerTangibleBookValue, metrics.latestPeriod?.tangibleBookValue);
    const priceBook = isFiniteNumber(metrics.valuation.marketCap) && isFiniteNumber(insurerBookValue)
      && insurerBookValue > 0
      ? metrics.valuation.marketCap / insurerBookValue
      : metrics.valuation.priceBook;
    const priceTangibleBook = isFiniteNumber(metrics.valuation.marketCap) && isFiniteNumber(insurerTangibleBookValue)
      && insurerTangibleBookValue > 0
      ? metrics.valuation.marketCap / insurerTangibleBookValue
      : metrics.valuation.priceTangibleBook;
    dimensions.growth = dimension("growth", [
      c("Premium growth", premiumGrowth, scoreHigherIsBetter(premiumGrowth, -0.03, 0.12), 1, false, specializedInputMissingReason("Premium growth", ["current and prior premiums"], "insurer")),
    ], "Reported premium growth replaces generic industrial revenue-growth assumptions.");
    dimensions.profitability = propertyCasualty
      ? dimension("profitability", [
        c("Combined ratio", combinedRatio, scoreLowerIsBetter(combinedRatio, 1.05, 0.88), 0.3, false, specializedInputMissingReason("Combined ratio", ["loss ratio", "expense ratio or reported combined ratio"], "insurer")),
        c("Loss ratio", lossRatio, scoreLowerIsBetter(lossRatio, 0.78, 0.55), 0.25, false, specializedInputMissingReason("Loss ratio", ["claims losses", "earned premiums"], "insurer")),
        c("Expense ratio", expenseRatio, scoreLowerIsBetter(expenseRatio, 0.42, 0.25), 0.2, false, specializedInputMissingReason("Expense ratio", ["underwriting expenses", "earned premiums"], "insurer")),
        c("Return on equity", insurerRoe, scoreHigherIsBetter(insurerRoe, 0.05, 0.18), 0.25, false, specializedInputMissingReason("Return on equity", ["insurer net income", "average equity"], "insurer")),
      ], "Underwriting ratios and reported insurer return on equity determine profitability.")
      : dimension("profitability", [
        c("Premium growth", premiumGrowth, scoreHigherIsBetter(premiumGrowth, -0.03, 0.12), 0.4, false, specializedInputMissingReason("Premium growth", ["current and prior premiums"], "insurer")),
        c("Return on equity", insurerRoe, scoreHigherIsBetter(insurerRoe, 0.05, 0.18), 0.6, false, specializedInputMissingReason("Return on equity", ["insurer net income", "average equity"], "insurer")),
      ], "Premium growth and reported insurer return on equity determine profitability when P&C underwriting ratios are not comparable.");
    dimensions.financialHealth = propertyCasualty
      ? dimension("financialHealth", [
        c("Regulatory capital ratio", regulatoryCapital, scoreHigherIsBetter(regulatoryCapital, 1, 2), 0.6, false, specializedInputMissingReason("Regulatory capital ratio", ["regulatory capital"], "insurer")),
        c("Reserve development", reserveDevelopment, scoreLowerIsBetter(reserveDevelopment, 0.08, -0.02), 0.4, false, specializedInputMissingReason("Reserve development", ["prior-year reserve development"], "insurer")),
      ], "Regulatory capital and reserve development replace corporate leverage ratios for insurers.")
      : dimension("financialHealth", [
        c("Regulatory capital ratio", regulatoryCapital, scoreHigherIsBetter(regulatoryCapital, 1, 2), 1, false, specializedInputMissingReason("Regulatory capital ratio", ["regulatory capital"], "insurer")),
      ], "Reported regulatory capital replaces corporate leverage ratios for insurers.");
    dimensions.cashFlow = dimension("cashFlow", [c("Corporate FCF", null, null, 1, true)], "Corporate free cash flow is not a valid primary measure for this archetype.");
    dimensions.valuation = dimension("valuation", [
      c("P / Tangible Book", priceTangibleBook, scoreLowerIsBetter(priceTangibleBook, 3, 0.8), 0.4, false, bookMultipleMissingReason("P / Tangible Book", metrics, insurerTangibleBookValueForMultiple, "insurer tangible book value or GAAP tangible book equity")),
      c("P / Book", priceBook, scoreLowerIsBetter(priceBook, 3, 0.8), 0.3, false, bookMultipleMissingReason("P / Book", metrics, insurerBookValueForMultiple, "insurer book value or GAAP book equity")),
      c("P / E", metrics.valuation.priceEarnings, scoreLowerIsBetter(metrics.valuation.priceEarnings, 24, 9), 0.3, false, priceEarningsMissingReason(metrics)),
    ], "Insurer valuation uses reported book, tangible book and earnings multiples.");
    dimensions.earningsQuality = propertyCasualty
      ? dimension("earningsQuality", [
        c("Reserve development", reserveDevelopment, scoreLowerIsBetter(reserveDevelopment, 0.08, -0.02), 0.5, false, specializedInputMissingReason("Reserve development", ["prior-year reserve development"], "insurer")),
        c("Combined ratio", combinedRatio, scoreLowerIsBetter(combinedRatio, 1.05, 0.88), 0.5, false, specializedInputMissingReason("Combined ratio", ["loss ratio", "expense ratio or reported combined ratio"], "insurer")),
      ], "P&C earnings quality uses reserve development and underwriting performance rather than corporate accrual ratios.")
      : dimension("earningsQuality", [
        c("Specialized insurance earnings quality", null, null, 1, false, "Non-P&C insurer earnings quality requires specialist reserve or policy data; corporate accrual metrics are not substituted."),
      ], "Life, reinsurance and other non-P&C earnings quality requires specialist reserve or policy data that is not substituted with corporate accrual metrics.");
    dimensions.quality = dimension("quality", [
      c("Return on equity", insurerRoe, scoreHigherIsBetter(insurerRoe, 0.05, 0.18), 0.6, false, specializedInputMissingReason("Return on equity", ["insurer net income", "average equity"], "insurer")),
      c("Regulatory capital ratio", regulatoryCapital, scoreHigherIsBetter(regulatoryCapital, 1, 2), 0.4, false, specializedInputMissingReason("Regulatory capital ratio", ["regulatory capital"], "insurer")),
    ], "Insurer quality uses reported equity returns and regulatory capital rather than industrial ROIC.");
    dimensions.risk = propertyCasualty
      ? dimension("risk", [
        c("Regulatory capital ratio", regulatoryCapital, scoreHigherIsBetter(regulatoryCapital, 1, 2), 0.5, false, specializedInputMissingReason("Regulatory capital ratio", ["regulatory capital"], "insurer")),
        c("Reserve development", reserveDevelopment, scoreLowerIsBetter(reserveDevelopment, 0.08, -0.02), 0.3, false, specializedInputMissingReason("Reserve development", ["prior-year reserve development"], "insurer")),
        c("Beta", input.market?.beta ?? null, scoreLowerIsBetter(input.market?.beta ?? null, 1.6, 0.7), 0.2, false, betaMissingReason()),
      ], "P&C risk uses regulatory capital, reserve development and bounded market sensitivity.")
      : dimension("risk", [
        c("Regulatory capital ratio", regulatoryCapital, scoreHigherIsBetter(regulatoryCapital, 1, 2), 0.7, false, specializedInputMissingReason("Regulatory capital ratio", ["regulatory capital"], "insurer")),
        c("Beta", input.market?.beta ?? null, scoreLowerIsBetter(input.market?.beta ?? null, 1.6, 0.7), 0.3, false, betaMissingReason()),
      ], "Non-P&C insurer risk uses regulatory capital and bounded market sensitivity; industrial leverage ratios are not substituted.");
  }

  if (archetype === "reit") {
    const reit = input.specialized?.kind === "reit" ? input.specialized : null;
    const ffo = specializedValue(reit?.fundsFromOperations) ?? latest?.fundsFromOperations ?? null;
    const affo = specializedValue(reit?.adjustedFundsFromOperations) ?? latest?.adjustedFundsFromOperations ?? null;
    const ffoGrowth = specializedValue(reit?.fundsFromOperationsGrowth);
    const affoGrowth = specializedValue(reit?.adjustedFundsFromOperationsGrowth);
    const occupancy = specializedValue(reit?.occupancy);
    const sameStoreNoiGrowth = specializedValue(reit?.sameStoreNoiGrowth);
    const netDebtToEbitdare = specializedValue(reit?.netDebtToEbitdare);
    const fixedChargeCoverage = specializedValue(reit?.fixedChargeCoverage);
    const affoPayout = specializedValue(reit?.adjustedFundsFromOperationsPayout);
    const dividendCoverage = specializedValue(reit?.dividendCoverage);
    const ffoMargin = isFiniteNumber(ffo) && isFiniteNumber(latest?.revenue) && latest.revenue !== 0
      ? ffo / latest.revenue
      : null;
    const ffoYield = isFiniteNumber(ffo) && isFiniteNumber(metrics.valuation.marketCap)
      ? ffo / metrics.valuation.marketCap
      : null;
    dimensions.growth = dimension("growth", [
      c("FFO growth", ffoGrowth, scoreHigherIsBetter(ffoGrowth, -0.08, 0.1), 0.5),
      c("AFFO growth", affoGrowth, scoreHigherIsBetter(affoGrowth, -0.08, 0.1), 0.5),
    ], "Reported FFO and AFFO growth replace GAAP EPS growth for REITs.");
    dimensions.profitability = dimension("profitability", [
      c("FFO margin", ffoMargin, scoreHigherIsBetter(ffoMargin, 0.15, 0.55), 0.4),
      c("Occupancy", occupancy, scoreHigherIsBetter(occupancy, 0.8, 0.97), 0.3),
      c("Same-store NOI growth", sameStoreNoiGrowth, scoreHigherIsBetter(sameStoreNoiGrowth, -0.03, 0.06), 0.3),
    ], "REIT profitability requires reported FFO and property operating metrics rather than GAAP EPS.");
    dimensions.valuation = dimension("valuation", [c("FFO yield", ffoYield, scoreHigherIsBetter(ffoYield, 0.025, 0.08), 1)], "P/FFO is used only when provider-reported FFO exists; P/E does not dominate.");
    dimensions.financialHealth = dimension("financialHealth", [
      c("Net debt / EBITDAre", netDebtToEbitdare, scoreLowerIsBetter(netDebtToEbitdare, 8, 4), 0.5),
      c("Fixed-charge coverage", fixedChargeCoverage, scoreHigherIsBetter(fixedChargeCoverage, 1.2, 3), 0.5),
    ], "REIT leverage and fixed-charge coverage replace generic industrial leverage ratios.");
    dimensions.cashFlow = dimension("cashFlow", [
      c("FFO margin", ffoMargin, scoreHigherIsBetter(ffoMargin, 0.15, 0.55), 0.25),
      c("AFFO payout", affoPayout, scoreTargetRange(affoPayout, 0, 0.25, 0.8, 1.2), 0.3),
      c("Dividend coverage", dividendCoverage, scoreHigherIsBetter(dividendCoverage, 0.8, 1.5), 0.25),
      c("AFFO growth", affoGrowth, scoreHigherIsBetter(affoGrowth, -0.08, 0.1), 0.2),
    ], "REIT cash generation uses reported FFO/AFFO economics rather than corporate free-cash-flow conversion.");
    dimensions.earningsQuality = dimension("earningsQuality", [
      c("AFFO payout", affoPayout, scoreTargetRange(affoPayout, 0, 0.25, 0.8, 1.2), 0.4),
      c("Dividend coverage", dividendCoverage, scoreHigherIsBetter(dividendCoverage, 0.8, 1.5), 0.3),
      c("AFFO", affo, isFiniteNumber(affo) && affo > 0 ? 70 : isFiniteNumber(affo) ? 20 : null, 0.3),
    ], "Reported AFFO, payout and dividend coverage determine REIT earnings quality.");
    dimensions.quality = dimension("quality", [
      c("Occupancy", occupancy, scoreHigherIsBetter(occupancy, 0.8, 0.97), 0.4),
      c("Same-store NOI growth", sameStoreNoiGrowth, scoreHigherIsBetter(sameStoreNoiGrowth, -0.03, 0.06), 0.3),
      c("AFFO growth", affoGrowth, scoreHigherIsBetter(affoGrowth, -0.08, 0.1), 0.3),
    ], "REIT quality uses occupancy and recurring property/AFFO growth rather than industrial ROIC or ROA.");
    dimensions.risk = dimension("risk", [
      c("Net debt / EBITDAre", netDebtToEbitdare, scoreLowerIsBetter(netDebtToEbitdare, 8, 4), 0.4),
      c("Fixed-charge coverage", fixedChargeCoverage, scoreHigherIsBetter(fixedChargeCoverage, 1.2, 3), 0.4),
      c("Beta", input.market?.beta ?? null, scoreLowerIsBetter(input.market?.beta ?? null, 1.6, 0.7), 0.2),
    ], "REIT risk uses property leverage, fixed-charge coverage and bounded market sensitivity instead of industrial interest coverage.");
  }

  if (archetype === "property_company") {
    const annualBalance = latestAnnualPeriod(input);
    const balance = [latest, annualBalance].find((periodCandidate) =>
      isFiniteNumber(periodCandidate?.totalAssets)
      || isFiniteNumber(periodCandidate?.totalEquity)
      || isFiniteNumber(periodCandidate?.totalDebt)
    ) ?? null;
    const propertyNetDebt = isFiniteNumber(balance?.totalDebt) && isFiniteNumber(balance?.cashAndEquivalents)
      ? balance.totalDebt - balance.cashAndEquivalents
      : metrics.ratios.netDebt;
    const netDebtToAssets = isFiniteNumber(propertyNetDebt) && isFiniteNumber(balance?.totalAssets) && balance.totalAssets !== 0
      ? propertyNetDebt / balance.totalAssets
      : null;
    const netDebtToEquity = isFiniteNumber(propertyNetDebt) && isFiniteNumber(balance?.totalEquity) && balance.totalEquity !== 0
      ? propertyNetDebt / balance.totalEquity
      : null;
    const leverageMissingReason = (label: string, denominatorLabel: string, denominator: number | null | undefined) =>
      balanceRatioMissingReason(label, "net debt", propertyNetDebt, denominatorLabel, denominator);

    dimensions.growth = dimension("growth", [
      c("Revenue growth", metrics.growth.revenueGrowthYoY, scoreHigherIsBetter(metrics.growth.revenueGrowthYoY, -0.03, 0.08), 0.55, false, revenueGrowthMissingReason(input, metrics)),
      c("Revenue CAGR 3Y", metrics.growth.revenueCagr3y, scoreHigherIsBetter(metrics.growth.revenueCagr3y, -0.03, 0.08), 0.45, false, revenueCagrMissingReason(input, 3)),
    ], "Property-company growth uses verified rental/property revenue trends; REIT-only FFO growth is not inferred.");
    dimensions.profitability = dimension("profitability", [
      c("Operating margin", metrics.margins.operatingMargin, scoreHigherIsBetter(metrics.margins.operatingMargin, 0.12, 0.45), 0.45, false, marginMissingReason("Operating margin", "operating income", metrics.latestPeriod?.operatingIncome, metrics.latestPeriod?.revenue)),
      c("Net margin", metrics.margins.netMargin, scoreHigherIsBetter(metrics.margins.netMargin, 0.02, 0.28), 0.25, false, marginMissingReason("Net margin", "net income", metrics.latestPeriod?.netIncome, metrics.latestPeriod?.revenue)),
      c("ROA", metrics.ratios.returnOnAssets, scoreHigherIsBetter(metrics.ratios.returnOnAssets, 0.01, 0.06), 0.3, false, returnOnAssetsMissingReason(input, metrics)),
    ], "Property-company profitability uses reported property-company margins and asset returns rather than industrial ROIC.");
    dimensions.financialHealth = dimension("financialHealth", [
      c("Net debt / assets", netDebtToAssets, scoreLowerIsBetter(netDebtToAssets, 0.6, 0.2), 0.35, false, leverageMissingReason("Net debt / assets", "assets", balance?.totalAssets)),
      c("Net debt / equity", netDebtToEquity, scoreLowerIsBetter(netDebtToEquity, 1.6, 0.35), 0.25, false, leverageMissingReason("Net debt / equity", "equity", balance?.totalEquity)),
      c("Interest coverage", metrics.ratios.interestCoverage, scoreHigherIsBetter(metrics.ratios.interestCoverage, 1.2, 4), 0.25, false, interestCoverageMissingReason(input, metrics)),
      c("Equity / assets", metrics.ratios.equityToAssets, scoreHigherIsBetter(metrics.ratios.equityToAssets, 0.25, 0.6), 0.15, false, balanceRatioMissingReason("Equity / assets", "equity", metrics.latestPeriod?.totalEquity, "assets", metrics.latestPeriod?.totalAssets)),
    ], "Property-company balance-sheet health emphasizes secured leverage, equity cushion and interest coverage.");
    dimensions.valuation = dimension("valuation", [
      c("P / Book", metrics.valuation.priceBook, scoreLowerIsBetter(metrics.valuation.priceBook, 1.6, 0.55), 0.45, false, bookMultipleMissingReason("P / Book", metrics, metrics.latestPeriod?.totalEquity, "book equity")),
      c("EV / EBITDA", metrics.valuation.evEbitda, scoreLowerIsBetter(metrics.valuation.evEbitda, 20, 8), 0.35, false, evEbitdaMissingReason(metrics)),
      c("EV / Sales", metrics.valuation.evSales, scoreLowerIsBetter(metrics.valuation.evSales, 10, 2.5), 0.2, false, evSalesMissingReason(metrics)),
    ], "Property-company valuation uses reported book equity and operating-property multiples; look-through NAV or NOI is not fabricated.");
    dimensions.cashFlow = dimension("cashFlow", [
      c("CFO margin", metrics.margins.operatingCashFlowMargin, scoreHigherIsBetter(metrics.margins.operatingCashFlowMargin, 0.05, 0.35), 0.4, false, cashFlowMarginMissingReason("CFO margin", "operating cash flow", metrics.latestPeriod?.operatingCashFlow, metrics.latestPeriod?.revenue)),
      c("Simple FCF margin", metrics.margins.freeCashFlowMargin, scoreHigherIsBetter(metrics.margins.freeCashFlowMargin, -0.05, 0.18), 0.25, false, cashFlowMarginMissingReason("Simple FCF margin", "operating cash flow and capex or provider-reported free cash flow", metrics.cashFlow.simpleFreeCashFlow, metrics.latestPeriod?.revenue)),
      c("FCF growth", metrics.growth.freeCashFlowGrowthYoY, scoreHigherIsBetter(metrics.growth.freeCashFlowGrowthYoY, -0.2, 0.15), 0.2, false, fcfGrowthMissingReason(input, metrics)),
      c("Share dilution", metrics.trends.sharesDilutionYoY, scoreLowerIsBetter(metrics.trends.sharesDilutionYoY, 0.08, -0.02), 0.15, false, shareDilutionMissingReason(input)),
    ], "Property-company cash flow separates operating cash generation from capex-heavy development cycles.");
    dimensions.earningsQuality = dimension("earningsQuality", [
      c("CFO / net income", metrics.cashFlow.cfoToNetIncome, scoreTargetRange(metrics.cashFlow.cfoToNetIncome, 0, 0.7, 1.6, 3), 0.4, false, netIncomeConversionMissingReason("CFO / net income", "operating cash flow", metrics.latestPeriod?.operatingCashFlow, metrics.latestPeriod?.netIncome)),
      c("Accrual ratio", metrics.cashFlow.accrualRatio, scoreLowerIsBetter(metrics.cashFlow.accrualRatio, 0.2, -0.05), 0.3, false, accrualRatioMissingReason(input, metrics)),
      c("Operating margin stability", metrics.cashFlow.operatingMarginStability, scoreHigherIsBetter(metrics.cashFlow.operatingMarginStability, 0.25, 0.85), 0.3, false, marginStabilityMissingReason(input, "Operating margin stability", "operating income", "operatingIncome")),
    ], "Property-company earnings quality uses cash conversion and margin stability because fair-value movements can distort accounting earnings.");
    dimensions.quality = dimension("quality", [
      c("ROA", metrics.ratios.returnOnAssets, scoreHigherIsBetter(metrics.ratios.returnOnAssets, 0.01, 0.06), 0.35, false, returnOnAssetsMissingReason(input, metrics)),
      c("Equity / assets", metrics.ratios.equityToAssets, scoreHigherIsBetter(metrics.ratios.equityToAssets, 0.25, 0.6), 0.3, false, balanceRatioMissingReason("Equity / assets", "equity", metrics.latestPeriod?.totalEquity, "assets", metrics.latestPeriod?.totalAssets)),
      c("Share dilution", metrics.trends.sharesDilutionYoY, scoreLowerIsBetter(metrics.trends.sharesDilutionYoY, 0.08, -0.02), 0.2, false, shareDilutionMissingReason(input)),
      c("Revenue CAGR 3Y", metrics.growth.revenueCagr3y, scoreHigherIsBetter(metrics.growth.revenueCagr3y, -0.03, 0.08), 0.15, false, revenueCagrMissingReason(input, 3)),
    ], "Property-company quality emphasizes asset returns, balance-sheet resilience and per-share discipline.");
    dimensions.risk = dimension("risk", [
      c("Net debt / assets", netDebtToAssets, scoreLowerIsBetter(netDebtToAssets, 0.6, 0.2), 0.4, false, leverageMissingReason("Net debt / assets", "assets", balance?.totalAssets)),
      c("Interest coverage", metrics.ratios.interestCoverage, scoreHigherIsBetter(metrics.ratios.interestCoverage, 1.2, 4), 0.35, false, interestCoverageMissingReason(input, metrics)),
      c("Beta", input.market?.beta ?? null, scoreLowerIsBetter(input.market?.beta ?? null, 1.6, 0.7), 0.25, false, betaMissingReason()),
    ], "Property-company risk combines asset leverage, debt service coverage and bounded market sensitivity.");
  }

  if (archetype === "asset_manager") {
    dimensions.growth = dimension("growth", [
      c("Revenue growth", metrics.growth.revenueGrowthYoY, scoreHigherIsBetter(metrics.growth.revenueGrowthYoY, -0.03, 0.08), 0.45, false, revenueGrowthMissingReason(input, metrics)),
      c("Revenue CAGR 3Y", metrics.growth.revenueCagr3y, scoreHigherIsBetter(metrics.growth.revenueCagr3y, -0.03, 0.1), 0.35, false, revenueCagrMissingReason(input, 3)),
      c("EPS CAGR 3Y", metrics.growth.epsCagr3y, scoreHigherIsBetter(metrics.growth.epsCagr3y, -0.03, 0.12), 0.2, false, epsCagrMissingReason(input)),
    ], "Asset-manager growth uses reported fee-revenue and earnings trends; AUM flow data is not inferred.");
    dimensions.profitability = dimension("profitability", [
      c("Operating margin", metrics.margins.operatingMargin, scoreHigherIsBetter(metrics.margins.operatingMargin, 0.18, 0.42), 0.35, false, marginMissingReason("Operating margin", "operating income", metrics.latestPeriod?.operatingIncome, metrics.latestPeriod?.revenue)),
      c("Net margin", metrics.margins.netMargin, scoreHigherIsBetter(metrics.margins.netMargin, 0.08, 0.28), 0.25, false, marginMissingReason("Net margin", "net income", metrics.latestPeriod?.netIncome, metrics.latestPeriod?.revenue)),
      c("Return on equity", metrics.ratios.returnOnEquity, scoreHigherIsBetter(metrics.ratios.returnOnEquity, 0.06, 0.22), 0.25, false, returnOnEquityMissingReason(input, metrics)),
      c("Return on assets", metrics.ratios.returnOnAssets, scoreHigherIsBetter(metrics.ratios.returnOnAssets, 0.02, 0.12), 0.15, false, returnOnAssetsMissingReason(input, metrics)),
    ], "Asset-manager profitability emphasizes fee margins and equity returns rather than bank spread metrics.");
    dimensions.financialHealth = dimension("financialHealth", [
      c("Equity / assets", metrics.ratios.equityToAssets, scoreHigherIsBetter(metrics.ratios.equityToAssets, 0.25, 0.65), 0.35, false, balanceRatioMissingReason("Equity / assets", "equity", metrics.latestPeriod?.totalEquity, "assets", metrics.latestPeriod?.totalAssets)),
      c("Cash / debt", metrics.ratios.cashToDebt, scoreHigherIsBetter(metrics.ratios.cashToDebt, 0.1, 1.5), 0.25, false, cashToDebtMissingReason(input, metrics)),
      c("Interest coverage", metrics.ratios.interestCoverage, scoreHigherIsBetter(metrics.ratios.interestCoverage, 2, 10), 0.25, false, interestCoverageMissingReason(input, metrics)),
      c("Debt / equity", metrics.ratios.debtToEquity, scoreLowerIsBetter(metrics.ratios.debtToEquity, 1.2, 0.1), 0.15, false, balanceRatioMissingReason("Debt / equity", "debt", metrics.latestPeriod?.totalDebt, "equity", metrics.latestPeriod?.totalEquity)),
    ], "Asset-manager health focuses on capital-light balance-sheet resilience rather than deposit or loan metrics.");
    dimensions.valuation = dimension("valuation", [
      c("P / E", metrics.valuation.priceEarnings, scoreLowerIsBetter(metrics.valuation.priceEarnings, 24, 9), 0.4, false, priceEarningsMissingReason(metrics)),
      c("EV / EBITDA", metrics.valuation.evEbitda, scoreLowerIsBetter(metrics.valuation.evEbitda, 18, 7), 0.35, false, evEbitdaMissingReason(metrics)),
      c("P / Book", metrics.valuation.priceBook, scoreLowerIsBetter(metrics.valuation.priceBook, 3.5, 0.9), 0.25, false, bookMultipleMissingReason("P / Book", metrics, metrics.latestPeriod?.totalEquity, "book equity")),
    ], "Asset-manager valuation uses reported earnings and capital-light multiples; AUM multiple data is not fabricated.");
    dimensions.cashFlow = dimension("cashFlow", [
      c("CFO margin", metrics.margins.operatingCashFlowMargin, scoreHigherIsBetter(metrics.margins.operatingCashFlowMargin, 0.05, 0.3), 0.3, false, cashFlowMarginMissingReason("CFO margin", "operating cash flow", metrics.latestPeriod?.operatingCashFlow, metrics.latestPeriod?.revenue)),
      c("Simple FCF margin", metrics.margins.freeCashFlowMargin, scoreHigherIsBetter(metrics.margins.freeCashFlowMargin, 0.03, 0.25), 0.25, false, cashFlowMarginMissingReason("Simple FCF margin", "operating cash flow and capex or provider-reported free cash flow", metrics.cashFlow.simpleFreeCashFlow, metrics.latestPeriod?.revenue)),
      c("FCF / net income", metrics.cashFlow.freeCashFlowToNetIncome, scoreTargetRange(metrics.cashFlow.freeCashFlowToNetIncome, 0, 0.8, 1.5, 3), 0.25, false, netIncomeConversionMissingReason("FCF / net income", "simple free cash flow", metrics.cashFlow.simpleFreeCashFlow, metrics.latestPeriod?.netIncome)),
      c("Share dilution", metrics.trends.sharesDilutionYoY, scoreLowerIsBetter(metrics.trends.sharesDilutionYoY, 0.08, -0.02), 0.2, false, shareDilutionMissingReason(input)),
    ], "Asset-manager cash generation uses reported operating cash flow and per-share discipline.");
    dimensions.earningsQuality = dimension("earningsQuality", [
      c("CFO / net income", metrics.cashFlow.cfoToNetIncome, scoreTargetRange(metrics.cashFlow.cfoToNetIncome, 0, 0.85, 1.5, 3), 0.4, false, netIncomeConversionMissingReason("CFO / net income", "operating cash flow", metrics.latestPeriod?.operatingCashFlow, metrics.latestPeriod?.netIncome)),
      c("Accrual ratio", metrics.cashFlow.accrualRatio, scoreLowerIsBetter(metrics.cashFlow.accrualRatio, 0.15, -0.05), 0.3, false, accrualRatioMissingReason(input, metrics)),
      c("Operating margin stability", metrics.cashFlow.operatingMarginStability, scoreHigherIsBetter(metrics.cashFlow.operatingMarginStability, 0.3, 0.9), 0.3, false, marginStabilityMissingReason(input, "Operating margin stability", "operating income", "operatingIncome")),
    ], "Asset-manager earnings quality is anchored in cash conversion and recurring fee-margin stability.");
    dimensions.quality = dimension("quality", [
      c("Return on equity", metrics.ratios.returnOnEquity, scoreHigherIsBetter(metrics.ratios.returnOnEquity, 0.06, 0.22), 0.35, false, returnOnEquityMissingReason(input, metrics)),
      c("Return on assets", metrics.ratios.returnOnAssets, scoreHigherIsBetter(metrics.ratios.returnOnAssets, 0.02, 0.12), 0.2, false, returnOnAssetsMissingReason(input, metrics)),
      c("Operating margin stability", metrics.cashFlow.operatingMarginStability, scoreHigherIsBetter(metrics.cashFlow.operatingMarginStability, 0.3, 0.9), 0.25, false, marginStabilityMissingReason(input, "Operating margin stability", "operating income", "operatingIncome")),
      c("Share dilution", metrics.trends.sharesDilutionYoY, scoreLowerIsBetter(metrics.trends.sharesDilutionYoY, 0.08, -0.02), 0.2, false, shareDilutionMissingReason(input)),
    ], "Asset-manager quality emphasizes durable fee economics, capital efficiency and per-share discipline.");
    dimensions.risk = dimension("risk", [
      c("Beta", input.market?.beta ?? null, scoreLowerIsBetter(input.market?.beta ?? null, 1.6, 0.7), 0.35, false, betaMissingReason()),
      c("Equity / assets", metrics.ratios.equityToAssets, scoreHigherIsBetter(metrics.ratios.equityToAssets, 0.25, 0.65), 0.35, false, balanceRatioMissingReason("Equity / assets", "equity", metrics.latestPeriod?.totalEquity, "assets", metrics.latestPeriod?.totalAssets)),
      c("Interest coverage", metrics.ratios.interestCoverage, scoreHigherIsBetter(metrics.ratios.interestCoverage, 2, 10), 0.3, false, interestCoverageMissingReason(input, metrics)),
    ], "Asset-manager risk combines market sensitivity with balance-sheet and debt-service resilience.");
  }

  if (archetype === "software_growth") {
    dimensions.growth = dimension("growth", [
      ...dimensions.growth.contributors ?? [],
      c("Growth + FCF margin", isFiniteNumber(metrics.growth.revenueGrowthYoY) && isFiniteNumber(metrics.margins.freeCashFlowMargin) ? metrics.growth.revenueGrowthYoY + metrics.margins.freeCashFlowMargin : null, scoreHigherIsBetter(isFiniteNumber(metrics.growth.revenueGrowthYoY) && isFiniteNumber(metrics.margins.freeCashFlowMargin) ? metrics.growth.revenueGrowthYoY + metrics.margins.freeCashFlowMargin : null, 0, 0.4), 0.25, false, growthPlusFcfMissingReason(metrics)),
    ], "Growth is balanced against cash generation rather than rewarded in isolation.");
    dimensions.quality = dimension("quality", [
      ...dimensions.quality.contributors ?? [],
      c("SBC / revenue", metrics.cashFlow.stockBasedCompensationToRevenue, scoreLowerIsBetter(metrics.cashFlow.stockBasedCompensationToRevenue, 0.25, 0.03), 0.25, false, sbcToRevenueMissingReason(metrics)),
    ], "Dilution and stock-based compensation are explicit quality costs.");
  }

  if (archetype === "cyclical") {
    dimensions.profitability = dimension("profitability", [
      c("Operating margin", metrics.margins.operatingMargin, scoreHigherIsBetter(metrics.margins.operatingMargin, 0, 0.18), 0.3, false, marginMissingReason("Operating margin", "operating income", metrics.latestPeriod?.operatingIncome, metrics.latestPeriod?.revenue)),
      c("Operating margin stability", metrics.cashFlow.operatingMarginStability, scoreHigherIsBetter(metrics.cashFlow.operatingMarginStability, 0.2, 0.8), 0.4, false, marginStabilityMissingReason(input, "Operating margin stability", "operating income", "operatingIncome")),
      c("ROIC", metrics.ratios.returnOnInvestedCapital, scoreHigherIsBetter(metrics.ratios.returnOnInvestedCapital, 0.03, 0.15), 0.3, false, roicMissingReason(input, metrics)),
    ], "Through-cycle stability prevents one peak margin year from dominating.");
    const hasFiveYearRevenueHistory = isFiniteNumber(metrics.growth.revenueCagr5y);
    const threeYearFallback = hasFiveYearRevenueHistory ? null : metrics.growth.revenueCagr3y;
    dimensions.growth = dimension("growth", [
      c("Revenue CAGR 5Y", metrics.growth.revenueCagr5y, scoreHigherIsBetter(metrics.growth.revenueCagr5y, -0.03, 0.08), hasFiveYearRevenueHistory ? 0.6 : 0.3, false, revenueCagrMissingReason(input, 5)),
      c("Revenue CAGR 3Y fallback", threeYearFallback, scoreHigherIsBetter(threeYearFallback, -0.03, 0.08), 0.3, hasFiveYearRevenueHistory, revenueCagrMissingReason(input, 3)),
      c("FCF stability", metrics.cashFlow.freeCashFlowStability, scoreHigherIsBetter(metrics.cashFlow.freeCashFlowStability, 0.2, 0.8), 0.4, false, fcfStabilityMissingReason(input)),
    ], "Five-year growth is preferred; a three-year CAGR can restore only partial coverage when the provider history is shorter, while the missing five-year evidence remains explicit.");
  }

  if (archetype === "pre_revenue_biotech") {
    const burn = isFiniteNumber(metrics.cashFlow.simpleFreeCashFlow) && metrics.cashFlow.simpleFreeCashFlow < 0
      ? Math.abs(metrics.cashFlow.simpleFreeCashFlow)
      : null;
    const runway = isFiniteNumber(latest?.cashAndEquivalents) && isFiniteNumber(burn) && burn > 0
      ? latest.cashAndEquivalents / burn
      : null;
    dimensions.growth = dimension("growth", [c("Revenue growth", null, null, 1, true)], "Pre-revenue companies are not penalized with meaningless earnings growth metrics.");
    dimensions.profitability = dimension("profitability", [c("R&D investment", latest?.researchAndDevelopment ?? null, null, 1)], "Pipeline economics require specialized clinical data not exposed by the current provider.");
    dimensions.financialHealth = dimension("financialHealth", [
      c("Cash runway (years)", runway, scoreHigherIsBetter(runway, 0.5, 3), 0.7),
      c("Share dilution", metrics.trends.sharesDilutionYoY, scoreLowerIsBetter(metrics.trends.sharesDilutionYoY, 0.25, 0), 0.3),
    ], "Cash runway and dilution replace corporate leverage metrics.");
    dimensions.valuation = dimension("valuation", [c("Pipeline valuation", null, null, 1, true)], "Risk-adjusted pipeline valuation requires real asset-level probabilities and is unavailable.");
  }

  if (archetype === "holding_company") {
    const annual = [...input.annualPeriods].filter((item) => item.fiscalYear !== undefined || item.periodEndDate).sort((a, b) => (a.periodEndDate ?? String(a.fiscalYear ?? "")).localeCompare(b.periodEndDate ?? String(b.fiscalYear ?? ""))).at(-1) ?? null;
    const completeBalance = (item: typeof latest) => Boolean(item && isFiniteNumber(item.totalDebt) && isFiniteNumber(item.cashAndEquivalents) && isFiniteNumber(item.totalEquity) && item.totalEquity > 0 && isFiniteNumber(item.totalAssets) && item.totalAssets > 0);
    const balance = completeBalance(latest) ? latest : completeBalance(annual) ? annual : null;
    const netDebtToEquity = balance && isFiniteNumber(balance.totalDebt) && isFiniteNumber(balance.cashAndEquivalents) && isFiniteNumber(balance.totalEquity) && balance.totalEquity > 0 ? (balance.totalDebt - balance.cashAndEquivalents) / balance.totalEquity : null;
    const cashToDebt = balance && isFiniteNumber(balance.cashAndEquivalents) && isFiniteNumber(balance.totalDebt) && balance.totalDebt !== 0 ? balance.cashAndEquivalents / balance.totalDebt : null;
    const equityToAssets = balance && isFiniteNumber(balance.totalEquity) && isFiniteNumber(balance.totalAssets) && balance.totalAssets > 0 ? balance.totalEquity / balance.totalAssets : null;
    const holdingNavMissingReason = "Holding-company analysis requires real look-through NAV per share or SOTP data; consolidated book equity is not substituted for NAV.";
    const hc = (label: string, value: number | null, score: number | null, weight: number, unsuitable = false, missingReason?: string) => contributor({ label, value, score, weight, period: balance?.periodEndDate, source: "StockBox deterministic formula", unsuitable, missingReason });
    dimensions.growth = dimension("growth", [hc("NAV / share growth", null, null, 1, false, holdingNavMissingReason)], "Holding-company growth requires look-through NAV per share rather than consolidated revenue growth.");
    dimensions.profitability = dimension("profitability", [hc("Operating-company profitability", null, null, 1, true)], "Operating margins and ROIC are unsuitable for investment holding companies.");
    dimensions.financialHealth = dimension("financialHealth", [
      hc("Net debt / equity", netDebtToEquity, scoreLowerIsBetter(netDebtToEquity, 0.35, 0), 0.45, false, balanceRatioMissingReason("Net debt / equity", "debt and cash", isFiniteNumber(balance?.totalDebt) && isFiniteNumber(balance?.cashAndEquivalents) ? balance.totalDebt - balance.cashAndEquivalents : null, "equity", balance?.totalEquity)),
      hc("Cash / debt", cashToDebt, scoreHigherIsBetter(cashToDebt, 0.1, 1), 0.25, false, balanceRatioMissingReason("Cash / debt", "cash", balance?.cashAndEquivalents, "debt", balance?.totalDebt)),
      hc("Equity / assets", equityToAssets, scoreHigherIsBetter(equityToAssets, 0.45, 0.85), 0.3, false, balanceRatioMissingReason("Equity / assets", "equity", balance?.totalEquity, "assets", balance?.totalAssets)),
    ], "Holding-company balance-sheet resilience uses same-period debt, cash and equity rather than EBITDA leverage.");
    dimensions.valuation = dimension("valuation", [hc("NAV discount / premium", null, null, 1, false, holdingNavMissingReason)], "A holding-company valuation requires real look-through NAV or SOTP data; book equity is not substituted for NAV.");
    dimensions.cashFlow = dimension("cashFlow", [hc("Corporate free cash flow", null, null, 1, true)], "Industrial free-cash-flow conversion is not comparable for an investment holding company.");
    dimensions.earningsQuality = dimension("earningsQuality", [hc("Operating accruals", null, null, 1, true)], "Industrial accrual metrics are not used for fair-value-driven holding-company earnings.");
    dimensions.quality = dimension("quality", [
      hc("NAV / share compounding", null, null, 0.5, false, holdingNavMissingReason),
      hc("Equity / assets", equityToAssets, scoreHigherIsBetter(equityToAssets, 0.45, 0.85), 0.25, false, balanceRatioMissingReason("Equity / assets", "equity", balance?.totalEquity, "assets", balance?.totalAssets)),
      hc("Share dilution", metrics.trends.sharesDilutionYoY, scoreLowerIsBetter(metrics.trends.sharesDilutionYoY, 0.08, -0.02), 0.25, false, shareDilutionMissingReason(input)),
    ], "Holding-company quality emphasizes NAV compounding, balance-sheet strength and per-share discipline.");
    dimensions.risk = dimension("risk", [
      hc("Beta", input.market?.beta ?? null, scoreLowerIsBetter(input.market?.beta ?? null, 1.5, 0.7), 0.35, false, betaMissingReason()),
      hc("Net debt / equity", netDebtToEquity, scoreLowerIsBetter(netDebtToEquity, 0.35, 0), 0.35, false, balanceRatioMissingReason("Net debt / equity", "debt and cash", isFiniteNumber(balance?.totalDebt) && isFiniteNumber(balance?.cashAndEquivalents) ? balance.totalDebt - balance.cashAndEquivalents : null, "equity", balance?.totalEquity)),
      hc("Equity / assets", equityToAssets, scoreHigherIsBetter(equityToAssets, 0.45, 0.85), 0.3, false, balanceRatioMissingReason("Equity / assets", "equity", balance?.totalEquity, "assets", balance?.totalAssets)),
    ], "Holding-company risk combines market sensitivity with same-period holding-level balance-sheet resilience.");
  }

  if (input.company.investmentProfile === "dividend" && ["standard", "software_growth", "cyclical", "utility"].includes(archetype)) {
    dimensions.cashFlow = dimension("cashFlow", [
      c("Dividend yield", metrics.cashFlow.dividendYield, scoreTargetRange(metrics.cashFlow.dividendYield, 0, 0.02, 0.06, 0.12), 0.2),
      c("FCF payout ratio", metrics.cashFlow.freeCashFlowPayoutRatio, scoreTargetRange(metrics.cashFlow.freeCashFlowPayoutRatio, 0, 0.2, 0.7, 1.2), 0.35),
      c("Dividend growth YoY", metrics.cashFlow.dividendGrowthYoY, scoreHigherIsBetter(metrics.cashFlow.dividendGrowthYoY, -0.1, 0.1), 0.2),
      c("Dividend CAGR 3Y", metrics.cashFlow.dividendCagr3y, scoreHigherIsBetter(metrics.cashFlow.dividendCagr3y, -0.03, 0.1), 0.25),
    ], "Yield is rewarded only alongside free-cash-flow coverage and dividend growth.");
  } else if (input.company.investmentProfile === "dividend" && archetype === "reit") {
    const reit = input.specialized?.kind === "reit" ? input.specialized : null;
    const affoPayout = specializedValue(reit?.adjustedFundsFromOperationsPayout);
    const dividendCoverage = specializedValue(reit?.dividendCoverage);
    const affoGrowth = specializedValue(reit?.adjustedFundsFromOperationsGrowth);
    dimensions.cashFlow = dimension("cashFlow", [
      c("Dividend yield", metrics.cashFlow.dividendYield, scoreTargetRange(metrics.cashFlow.dividendYield, 0, 0.02, 0.06, 0.12), 0.2),
      c("AFFO payout", affoPayout, scoreTargetRange(affoPayout, 0, 0.25, 0.8, 1.2), 0.3),
      c("Dividend coverage", dividendCoverage, scoreHigherIsBetter(dividendCoverage, 0.8, 1.5), 0.3),
      c("AFFO growth", affoGrowth, scoreHigherIsBetter(affoGrowth, -0.08, 0.1), 0.2),
    ], "REIT dividends require reported AFFO payout and dividend coverage rather than generic FCF payout.");
  }

  return dimensions;
}

function aggregate(dimensions: Record<ScoreDimensionKey, ScoreDimension>, weights: Record<ScoreDimensionKey, number>) {
  const entries = Object.entries(weights) as Array<[ScoreDimensionKey, number]>;
  const applicable = entries.filter(([key]) => (dimensions[key].plannedWeight ?? 0) > 0);
  const applicableWeight = applicable.reduce((sum, [, weight]) => sum + weight, 0);
  const coverage = applicableWeight > 0
    ? applicable.reduce((sum, [key, weight]) => sum + (dimensions[key].coverage ?? 0) * weight, 0) / applicableWeight
    : 0;
  const available = applicable.filter(([key]) => isFiniteNumber(dimensions[key].score));
  const availableWeight = available.reduce((sum, [, weight]) => sum + weight, 0);
  const rawScore = availableWeight > 0
    ? available.reduce((sum, [key, weight]) => sum + (dimensions[key].score as number) * weight, 0) / availableWeight
    : null;
  const score = rawScore === null || coverage < SCORE_COVERAGE_POLICY.overallMinimum
    ? null
    : 50 + (rawScore - 50) * coverage;
  return { score: isFiniteNumber(score) ? clamp(score, 0, 100) : null, coverage };
}

function freshnessScore(input: FinancialAnalysisInput, metrics: FinancialMetrics): number {
  const end = metrics.latestPeriod?.periodEndDate;
  if (!end) return 35;
  const age = (Date.parse(input.analysisDate ?? new Date().toISOString()) - Date.parse(end)) / 86_400_000;
  if (!Number.isFinite(age)) return 35;
  if (age <= 120) return 100;
  if (age <= 240) return 80;
  if (age <= 400) return 60;
  return 30;
}

function sourceQuality(input: FinancialAnalysisInput): number {
  const diagnostics = input.providerDiagnostics ?? [];
  const coreCapabilities = new Set(["fundamentals", "market_data", "estimates"] as const);
  const coreDiagnostics = diagnostics.filter((item) => coreCapabilities.has(item.capability as "fundamentals" | "market_data" | "estimates"));
  if (!coreDiagnostics.length) return 60;
  const statusScore = { available: 100, partial: 65, unavailable: 20, unsupported: 20 } as const;
  const bestByCapability = new Map<string, number>();
  for (const item of coreDiagnostics) {
    const score = statusScore[item.status];
    bestByCapability.set(item.capability, Math.max(bestByCapability.get(item.capability) ?? 0, score));
  }
  const scores = [...bestByCapability.values()];
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

function marketInputFreshness(input: FinancialAnalysisInput): number {
  if (!isFiniteNumber(input.market?.price)) return 20;
  if (!input.market?.priceDate) return 55;
  const analysisTime = Date.parse(input.analysisDate ?? new Date().toISOString());
  const marketTime = Date.parse(input.market.priceDate);
  const ageDays = (analysisTime - marketTime) / 86_400_000;
  if (!Number.isFinite(ageDays) || ageDays < -1) return 0;
  if (ageDays <= 10) return 100;
  return 10;
}

function valuationAssumptionConfidence(
  quality: ValuationAssumptionQuality | null | undefined,
  status: "available" | "unavailable" | "inappropriate" | undefined,
): number {
  if (status === "inappropriate") return 100;
  if (status === "unavailable") return 20;
  if (!quality) return 50;
  if (quality.level === "high") return 100;
  if (quality.level === "moderate") return 65;
  return 20;
}

export function computeScores(
  input: FinancialAnalysisInput,
  metrics: FinancialMetrics,
  context: {
    reconciliation?: number;
    valuationAssumptionQuality?: ValuationAssumptionQuality | null;
    valuationStatus?: "available" | "unavailable" | "inappropriate";
  } = {},
): ScoreResult {
  const sector = input.company.sector ?? "other";
  const investmentProfile = input.company.investmentProfile ?? "balanced";
  const analysisArchetype = resolveFinancialArchetype(input);
  const sectorWeights = weightsForSector(sector);
  const personalizedWeights = weightsForSectorAndProfile(sector, investmentProfile);
  const dimensions = archetypeDimensions(input, metrics, analysisArchetype);
  const general = aggregate(dimensions, sectorWeights);
  const personalized = aggregate(dimensions, personalizedWeights);
  const shortTerm = aggregate(dimensions, shortTermWeights);
  const longTerm = aggregate(dimensions, longTermWeights);
  const specializedCoverage = specializedCoverageFor(analysisArchetype, input.company, input.specialized);
  for (const key of Object.keys(dimensions) as ScoreDimensionKey[]) dimensions[key].weight = sectorWeights[key];

  const estimateAvailability = input.estimates && Object.values(input.estimates).some(isFiniteNumber) ? 90 : 45;
  const valuationInputs = isFiniteNumber(metrics.valuation.marketCap) && isFiniteNumber(metrics.valuation.enterpriseValue) ? 100 : isFiniteNumber(metrics.valuation.marketCap) ? 60 : 20;
  const currencyState = valuationCurrencyAlignment(input, metrics.latestPeriod);
  const classification = input.company.classificationDiagnostics;
  const sourceConflictPolicy = summarizeSourceConflicts(input);
  const confidenceBreakdown: ConfidenceBreakdown = {
    dataCoverage: Math.round(general.coverage * 100),
    dataFreshness: Math.round(freshnessScore(input, metrics)),
    sourceQuality: Math.round(sourceQuality(input)),
    reconciliation: Math.round(context.reconciliation ?? 70),
    estimateAvailability,
    valuationInputs,
    entityIdentity: Math.round(clamp(
      input.company.entityIdentityConfidence ?? (input.company.entityId || input.company.cik ? 90 : 70),
      0,
      100,
    )),
    currencyAlignment: currencyState === "aligned" ? 100 : currencyState === "unknown" ? 25 : 0,
    archetypeConfidence: Math.round(clamp(
      classification
        ? classification.ambiguous
          ? Math.min(classification.confidence * 100, 35)
          : classification.confidence * 100
        : analysisArchetype === "unknown"
          ? 0
          : input.company.analysisArchetype
            ? 90
            : 70,
      0,
      100,
    )),
    specializedCoverage: specializedCoverage ? Math.round(specializedCoverage.overall * 100) : null,
    marketInputFreshness: marketInputFreshness(input),
    valuationAssumptions: valuationAssumptionConfidence(context.valuationAssumptionQuality, context.valuationStatus),
    sourceConflict: sourceConflictPolicy.confidenceScore,
  };
  const confidenceComponents: Array<[number | null, number]> = [
    [confidenceBreakdown.dataCoverage, 0.25], [confidenceBreakdown.dataFreshness, 0.15],
    [confidenceBreakdown.sourceQuality, 0.08], [confidenceBreakdown.reconciliation, 0.08],
    [confidenceBreakdown.estimateAvailability, 0.03], [confidenceBreakdown.valuationInputs, 0.05],
    [confidenceBreakdown.entityIdentity, 0.05], [confidenceBreakdown.currencyAlignment, 0.08],
    [confidenceBreakdown.archetypeConfidence, 0.05], [confidenceBreakdown.specializedCoverage, 0.06],
    [confidenceBreakdown.marketInputFreshness, 0.05], [confidenceBreakdown.valuationAssumptions, 0.03],
    [confidenceBreakdown.sourceConflict, 0.04],
  ];
  let confidenceWeightedSum = 0;
  let confidenceWeight = 0;
  for (const [value, weight] of confidenceComponents) {
    if (value === null) continue;
    confidenceWeightedSum += value * weight;
    confidenceWeight += weight;
  }
  const uncappedConfidence = confidenceWeight > 0 ? confidenceWeightedSum / confidenceWeight : 5;
  let confidenceCeiling = 98;
  if (general.score === null) {
    confidenceCeiling = Math.min(confidenceCeiling, general.coverage < 0.35 ? 40 : 55);
  }
  if (analysisArchetype === "unknown") confidenceCeiling = Math.min(confidenceCeiling, 35);
  if (classification?.ambiguous) confidenceCeiling = Math.min(confidenceCeiling, 40);
  if (["bank", "insurer", "reit"].includes(analysisArchetype) && specializedCoverage) {
    if (specializedCoverage.overall < 0.3) confidenceCeiling = Math.min(confidenceCeiling, 45);
    else if (specializedCoverage.overall < 0.7) confidenceCeiling = Math.min(confidenceCeiling, 60);
  }
  const confidence = Math.round(clamp(Math.min(uncappedConfidence, confidenceCeiling), 5, 98));
  const missingData = [...metrics.missingData, ...Object.values(dimensions).flatMap((item) => item.missingData ?? [])];
  const archetypeCanBeScored = !["unknown", "pre_revenue_biotech", "holding_company"].includes(analysisArchetype);
  return {
    stockBoxScore: !archetypeCanBeScored || general.score === null ? null : Math.round(general.score * 10) / 10,
    personalizedScore: !archetypeCanBeScored || personalized.score === null ? null : Math.round(personalized.score * 10) / 10,
    investmentProfile,
    sector,
    analysisArchetype,
    confidence,
    confidenceBreakdown,
    dataCoverage: general.coverage,
    dimensions,
    shortTermScore: !archetypeCanBeScored || shortTerm.score === null ? null : Math.round(shortTerm.score),
    longTermScore: !archetypeCanBeScored || longTerm.score === null ? null : Math.round(longTerm.score),
    specializedCoverage,
    methodology: {
      modelVersion: MODEL_VERSION,
      scorePolicyVersion: SCORE_POLICY_VERSION,
      benchmarkVersion: STATIC_BENCHMARK_VERSION,
      sectorWeights,
      personalizedWeights,
    },
    missingData,
  };
}
