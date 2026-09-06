import type { MetricProvenance, ProviderReportedValuation } from "@/lib/analysis/types";
import {
  convertWithComparisonFxContext,
  resolveComparisonFxContexts,
  type ComparisonFxContext,
} from "./ecb-fx";

const MAX_FX_LAG_DAYS = 7;

export type FxNormalizedProviderReportedValuation = ProviderReportedValuation & {
  freeCashFlowYield?: number | null;
  freeCashFlowYieldProvenance?: MetricProvenance;
};

type FcfYieldFxContextResolver = typeof resolveComparisonFxContexts;

function normalizedCurrency(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase();
  return normalized && /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

function utcDay(value: string | null | undefined) {
  if (!value) return null;
  const day = value.slice(0, 10);
  const timestamp = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function lagDays(earlier: string, later: string) {
  const left = utcDay(earlier);
  const right = utcDay(later);
  if (left === null || right === null) return Number.POSITIVE_INFINITY;
  return Math.floor((right - left) / 86_400_000);
}

export function deriveFxNormalizedProviderFcfYield(
  reported: ProviderReportedValuation,
  context: ComparisonFxContext | undefined,
): FxNormalizedProviderReportedValuation {
  const marketCap = reported.marketCap;
  const freeCashFlow = reported.freeCashFlow;
  const marketCapCurrency = normalizedCurrency(reported.marketCapCurrency);
  const freeCashFlowCurrency = normalizedCurrency(reported.freeCashFlowCurrency);
  const valuationDate = reported.asOfDate?.slice(0, 10) ?? null;
  const rateDate = context?.rateDate?.slice(0, 10) ?? null;

  if (
    !Number.isFinite(marketCap)
    || (marketCap ?? 0) <= 0
    || !Number.isFinite(freeCashFlow)
    || !marketCapCurrency
    || !freeCashFlowCurrency
    || marketCapCurrency === freeCashFlowCurrency
    || context?.status !== "normalized"
    || context.provider !== "ecb-euro-reference-rates"
    || context.methodologyVersion !== "ecb-fx-v1"
    || context.sourceCurrency !== freeCashFlowCurrency
    || context.targetCurrency !== marketCapCurrency
    || !valuationDate
    || !rateDate
  ) {
    return reported;
  }

  const lag = lagDays(rateDate, valuationDate);
  if (lag < 0 || lag > MAX_FX_LAG_DAYS) return reported;

  const convertedFreeCashFlow = convertWithComparisonFxContext(freeCashFlow as number, context);
  if (!Number.isFinite(convertedFreeCashFlow)) return reported;

  const freeCashFlowYield = (convertedFreeCashFlow as number) / (marketCap as number);
  if (!Number.isFinite(freeCashFlowYield)) return reported;

  return {
    ...reported,
    freeCashFlowYield,
    freeCashFlowYieldProvenance: {
      source: "ECB foreign exchange reference rates",
      provider: "ecb",
      concept: "FreeCashFlowYieldFxNormalized",
      unit: "ratio",
      periodEnd: rateDate,
      valueKind: "derived",
      inputs: [
        `providerReportedFreeCashFlow:${freeCashFlow} ${freeCashFlowCurrency}`,
        `providerReportedMarketCap:${marketCap} ${marketCapCurrency}`,
        `ecbRateDate:${rateDate}`,
        `ecbRatePerEuro:${freeCashFlowCurrency}=${context.sourceRatePerEuro}`,
        `ecbRatePerEuro:${marketCapCurrency}=${context.targetRatePerEuro}`,
      ],
      note: `Provider free cash flow was converted from ${freeCashFlowCurrency} to ${marketCapCurrency} with the dated ECB reference rate before division by provider market cap. Raw provider values and currencies were preserved.`,
    },
  };
}

export async function enrichProviderReportedValuationWithEcbFcfYield(
  reported: ProviderReportedValuation,
  resolveContexts: FcfYieldFxContextResolver = resolveComparisonFxContexts,
): Promise<FxNormalizedProviderReportedValuation> {
  void resolveContexts;
  return reported;
}
