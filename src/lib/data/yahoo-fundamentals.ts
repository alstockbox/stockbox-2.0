import type {
  CompanyFundamentals,
  CompanySearchResult,
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

  const periods = [
    fundamentals.trailingTwelveMonths,
    ...(fundamentals.annualPeriods ?? []),
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

  const aligned = alignReportedValuationFcfWithAnnualFallback(core.data);
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
