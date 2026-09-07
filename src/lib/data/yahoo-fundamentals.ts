import type {
  CompanyFundamentals,
  CompanySearchResult,
  FinancialPeriod,
  MetricProvenance,
  ProviderDiagnostic,
} from "@/lib/analysis/types";
import {
  YAHOO_FUNDAMENTALS_CAPABILITIES,
  fetchYahooFundamentalsResult as fetchCoreYahooFundamentalsResult,
} from "./yahoo-fundamentals-core";
import { enrichSpecializedFundamentals } from "./specialized-enrichment";
import type { AdapterResult, FundamentalsProvider } from "./providers";

export * from "./yahoo-fundamentals-core";

type ReportedValuationWithFcfBasis = NonNullable<CompanyFundamentals["reportedValuation"]> & {
  freeCashFlowPeriodBasis?: MetricProvenance["periodBasis"];
};

const YAHOO_PROVIDER_ID = "yahoo-fundamentals";
const EPS_RECONCILIATION_TOLERANCE = 0.03;
const EPS_RECONCILIATION_MIN_POINTS = 2;
const EPS_RECONCILIATION_MAX_POINTS = 3;
const EPS_RECONCILIATION_MAX_AGE_DAYS = 800;

function diagnosticKey(diagnostic: ProviderDiagnostic): string {
  return [
    diagnostic.provider,
    diagnostic.capability,
    diagnostic.status,
    diagnostic.reason ?? "",
  ].join("|");
}

function appendUniqueDiagnostics(
  fundamentals: CompanyFundamentals,
  additions: ProviderDiagnostic[],
): CompanyFundamentals {
  const diagnostics = fundamentals.diagnostics;
  if (!diagnostics || additions.length === 0) return fundamentals;

  const providerDiagnostics = [...(diagnostics.providerDiagnostics ?? [])];
  const known = new Set(providerDiagnostics.map(diagnosticKey));
  for (const diagnostic of additions) {
    const key = diagnosticKey(diagnostic);
    if (known.has(key)) continue;
    known.add(key);
    providerDiagnostics.push(diagnostic);
  }

  return {
    ...fundamentals,
    diagnostics: {
      ...diagnostics,
      providerDiagnostics,
    },
  };
}

function normalizedCurrency(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase();
  return normalized || null;
}

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function deriveYahooRevenueForPeriod(period: FinancialPeriod): FinancialPeriod {
  if (finite(period.revenue) || !period.periodEndDate) return period;

  const grossProfit = period.grossProfit;
  const costOfRevenue = period.costOfRevenue;
  const grossProvenance = period.provenance?.grossProfit;
  const costProvenance = period.provenance?.costOfRevenue;
  const currency = normalizedCurrency(period.currency);
  const periodBasis = period.periodBasis;

  if (
    !finite(grossProfit)
    || !finite(costOfRevenue)
    || !currency
    || !["FY", "TTM_REPORTED"].includes(periodBasis ?? "")
    || grossProvenance?.provider !== YAHOO_PROVIDER_ID
    || grossProvenance.valueKind !== "reported"
    || grossProvenance.periodEnd !== period.periodEndDate
    || grossProvenance.periodBasis !== periodBasis
    || normalizedCurrency(grossProvenance.unit) !== currency
    || !grossProvenance.concept
    || costProvenance?.provider !== YAHOO_PROVIDER_ID
    || costProvenance.valueKind !== "reported"
    || costProvenance.periodEnd !== period.periodEndDate
    || costProvenance.periodBasis !== periodBasis
    || normalizedCurrency(costProvenance.unit) !== currency
    || !costProvenance.concept
  ) {
    return period;
  }

  const revenue = grossProfit + costOfRevenue;
  if (!Number.isFinite(revenue)) return period;

  const revenueProvenance: MetricProvenance = {
    source: "Yahoo Finance fundamentals timeseries",
    provider: YAHOO_PROVIDER_ID,
    unit: currency,
    periodEnd: period.periodEndDate,
    periodBasis,
    inputs: [grossProvenance.concept, costProvenance.concept],
    valueKind: "derived",
    note: "Revenue derived as same-period Yahoo GrossProfit plus CostOfRevenue because direct TotalRevenue was unavailable.",
  };

  return {
    ...period,
    revenue,
    provenance: {
      ...(period.provenance ?? {}),
      revenue: revenueProvenance,
    },
  };
}

function deriveYahooRevenueFromComponents(
  fundamentals: CompanyFundamentals,
): CompanyFundamentals {
  return {
    ...fundamentals,
    annual: fundamentals.annual.map(deriveYahooRevenueForPeriod),
    annualPeriods: fundamentals.annualPeriods?.map(deriveYahooRevenueForPeriod),
    trailingTwelveMonths: fundamentals.trailingTwelveMonths
      ? deriveYahooRevenueForPeriod(fundamentals.trailingTwelveMonths)
      : fundamentals.trailingTwelveMonths,
  };
}

function annualDilutedEpsInputs(period: FinancialPeriod): {
  value: number;
  inputs: string[];
} | null {
  const date = period.periodEndDate;
  const income = period.dilutedNetIncomeAvailableToCommon;
  const shares = period.sharesDiluted;
  const incomeProvenance = period.provenance?.dilutedNetIncomeAvailableToCommon;
  const sharesProvenance = period.provenance?.sharesDiluted;
  const periodCurrency = normalizedCurrency(period.currency);
  const incomeCurrency = normalizedCurrency(incomeProvenance?.unit);

  if (
    period.periodBasis !== "FY"
    || !date
    || !finite(income)
    || !finite(shares)
    || shares <= 0
    || !periodCurrency
    || incomeCurrency !== periodCurrency
    || incomeProvenance?.provider !== YAHOO_PROVIDER_ID
    || incomeProvenance.valueKind !== "reported"
    || incomeProvenance.periodEnd !== date
    || incomeProvenance.periodBasis !== "FY"
    || sharesProvenance?.provider !== YAHOO_PROVIDER_ID
    || sharesProvenance.valueKind !== "reported"
    || sharesProvenance.periodEnd !== date
    || !["FY", "TTM_REPORTED"].includes(sharesProvenance.periodBasis ?? "")
  ) {
    return null;
  }

  const value = income / shares;
  if (!Number.isFinite(value)) return null;
  return {
    value,
    inputs: [
      incomeProvenance.concept ?? "annualDilutedNIAvailtoComStockholders",
      sharesProvenance.concept ?? "annualDilutedAverageShares",
    ],
  };
}

function directAnnualDilutedEpsReconciliation(
  period: FinancialPeriod,
): { date: string; relativeError: number } | null {
  const date = period.periodEndDate;
  const directEps = period.epsDiluted;
  const epsProvenance = period.provenance?.epsDiluted;
  const periodCurrency = normalizedCurrency(period.currency);
  const epsCurrency = normalizedCurrency(epsProvenance?.unit);
  const inputs = annualDilutedEpsInputs(period);
  if (
    !date
    || !finite(directEps)
    || !inputs
    || !periodCurrency
    || epsCurrency !== periodCurrency
    || epsProvenance?.provider !== YAHOO_PROVIDER_ID
    || epsProvenance.valueKind !== "reported"
    || epsProvenance.periodEnd !== date
    || epsProvenance.periodBasis !== "FY"
  ) {
    return null;
  }
  const denominator = Math.max(Math.abs(directEps), 0.01);
  return {
    date,
    relativeError: Math.abs(inputs.value - directEps) / denominator,
  };
}

function historicallyReconciledDilutedEps(
  periods: FinancialPeriod[],
  currentDate: string,
): boolean {
  const points = periods
    .filter((period) => Boolean(period.periodEndDate && period.periodEndDate < currentDate))
    .flatMap((period) => {
      const point = directAnnualDilutedEpsReconciliation(period);
      return point ? [point] : [];
    })
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, EPS_RECONCILIATION_MAX_POINTS);

  if (points.length < EPS_RECONCILIATION_MIN_POINTS) return false;
  const latestPoint = points[0];
  const ageDays = (Date.parse(`${currentDate}T00:00:00Z`) - Date.parse(`${latestPoint.date}T00:00:00Z`)) / 86_400_000;
  if (!Number.isFinite(ageDays) || ageDays < 0 || ageDays > EPS_RECONCILIATION_MAX_AGE_DAYS) return false;
  return points.every((point) => point.relativeError <= EPS_RECONCILIATION_TOLERANCE);
}

function deriveReconciledAnnualDilutedEps(
  fundamentals: CompanyFundamentals,
): CompanyFundamentals {
  const periods = fundamentals.annualPeriods ?? [];
  if (!periods.length) return fundamentals;

  const annualPeriods = periods.map((period) => {
    if (finite(period.epsDiluted) || !period.periodEndDate) return period;
    const inputs = annualDilutedEpsInputs(period);
    if (!inputs || !historicallyReconciledDilutedEps(periods, period.periodEndDate)) return period;

    const epsProvenance: MetricProvenance = {
      source: "Yahoo Finance fundamentals timeseries",
      provider: YAHOO_PROVIDER_ID,
      unit: period.currency ?? undefined,
      periodEnd: period.periodEndDate,
      periodBasis: "FY",
      inputs: inputs.inputs,
      valueKind: "derived",
      note: "Diluted EPS derived from same-date Yahoo diluted income available to common divided by diluted average shares only after at least two recent annual periods reconciled the same formula to Yahoo reported diluted EPS within 3%.",
    };
    return {
      ...period,
      epsDiluted: inputs.value,
      provenance: {
        ...(period.provenance ?? {}),
        epsDiluted: epsProvenance,
      },
    };
  });

  const periodsByDate = new Map(annualPeriods.flatMap((period) => period.periodEndDate ? [[period.periodEndDate, period] as const] : []));
  const annual = fundamentals.annual.map((period) => {
    const enriched = period.periodEndDate ? periodsByDate.get(period.periodEndDate) : undefined;
    if (!enriched) return period;
    return {
      ...period,
      epsDiluted: enriched.epsDiluted ?? null,
      provenance: enriched.provenance,
    };
  });

  return {
    ...fundamentals,
    annual,
    annualPeriods,
  };
}

function alignReportedValuationFcfWithAnnualFallback(
  fundamentals: CompanyFundamentals,
): CompanyFundamentals {
  const reported = fundamentals.reportedValuation;
  const flowDate = fundamentals.diagnostics?.financialFlowPeriodEnd ?? null;
  if (
    !reported
    || fundamentals.trailingTwelveMonths
    || fundamentals.diagnostics?.financialFlowPeriodBasis !== "FY"
    || !flowDate
    || Number.isFinite(reported.freeCashFlow)
  ) {
    return fundamentals;
  }

  const period = fundamentals.annualPeriods?.find((item) => item.periodEndDate === flowDate);
  const freeCashFlow = period?.freeCashFlow;
  const provenance = period?.provenance?.freeCashFlow;
  const periodCurrency = normalizedCurrency(period?.currency);
  const provenanceCurrency = normalizedCurrency(provenance?.unit);

  if (
    !period
    || period.periodBasis !== "FY"
    || !Number.isFinite(freeCashFlow)
    || provenance?.valueKind !== "reported"
    || provenance.provider !== "yahoo-fundamentals"
    || !periodCurrency
    || !provenanceCurrency
    || periodCurrency !== provenanceCurrency
  ) {
    return fundamentals;
  }

  const reportedWithBasis: ReportedValuationWithFcfBasis = {
    ...reported,
    freeCashFlow: freeCashFlow as number,
    freeCashFlowCurrency: periodCurrency,
    freeCashFlowDate: flowDate,
    freeCashFlowPeriodBasis: "FY",
  };

  return {
    ...fundamentals,
    reportedValuation: reportedWithBasis,
  };
}

function attachReportedValuationFcfPeriodBasis(
  fundamentals: CompanyFundamentals,
): CompanyFundamentals {
  const reported = fundamentals.reportedValuation as ReportedValuationWithFcfBasis | undefined;
  const reportedFcfCurrency = normalizedCurrency(reported?.freeCashFlowCurrency);
  if (
    !reported
    || !Number.isFinite(reported.freeCashFlow)
    || !reported.freeCashFlowDate
    || !reportedFcfCurrency
    || reported.freeCashFlowPeriodBasis
  ) {
    return fundamentals;
  }

  // At a fiscal-year endpoint Yahoo can publish the exact same direct FCF fact
  // under both annual and trailing concepts. Prefer the independently reported
  // FY match only when date, value and currency all reconcile exactly; otherwise
  // the trailing basis remains authoritative.
  const periods = [
    ...(fundamentals.annualPeriods ?? []),
    fundamentals.trailingTwelveMonths,
  ].filter((period): period is NonNullable<typeof period> => Boolean(period));

  const matchingPeriod = periods.find((period) => {
    const provenance = period.provenance?.freeCashFlow;
    return period.periodEndDate === reported.freeCashFlowDate
      && Number.isFinite(period.freeCashFlow)
      && period.freeCashFlow === reported.freeCashFlow
      && normalizedCurrency(period.currency) === reportedFcfCurrency
      && normalizedCurrency(provenance?.unit) === reportedFcfCurrency
      && provenance?.valueKind === "reported"
      && provenance.provider === "yahoo-fundamentals"
      && Boolean(provenance.periodBasis);
  });
  const periodBasis = matchingPeriod?.provenance?.freeCashFlow?.periodBasis;
  if (!periodBasis) return fundamentals;

  const reportedWithBasis: ReportedValuationWithFcfBasis = {
    ...reported,
    freeCashFlowPeriodBasis: periodBasis,
  };
  return {
    ...fundamentals,
    reportedValuation: reportedWithBasis,
  };
}

export async function fetchYahooFundamentalsResult(
  company: CompanySearchResult,
): Promise<AdapterResult<CompanyFundamentals>> {
  const core = await fetchCoreYahooFundamentalsResult(company);
  if (!core.ok) return core;

  const withDerivedRevenue = deriveYahooRevenueFromComponents(core.data);
  const withReconciledEps = deriveReconciledAnnualDilutedEps(withDerivedRevenue);
  const aligned = alignReportedValuationFcfWithAnnualFallback(withReconciledEps);
  const withFcfBasis = attachReportedValuationFcfPeriodBasis(aligned);
  const enrichment = await enrichSpecializedFundamentals(company, withFcfBasis);
  return {
    ...core,
    data: appendUniqueDiagnostics(
      enrichment.fundamentals,
      enrichment.diagnostics,
    ),
  };
}

export const yahooFundamentalsProvider: FundamentalsProvider = {
  id: "yahoo-fundamentals",
  capabilities: YAHOO_FUNDAMENTALS_CAPABILITIES,
  fetchFundamentals: fetchYahooFundamentalsResult,
};
