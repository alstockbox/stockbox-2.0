import type { MetricProvenance, ProviderReportedValuation } from "@/lib/analysis/types";
import type { ComparisonFxContext } from "./ecb-fx";

export type FxNormalizedProviderReportedValuation = ProviderReportedValuation & {
  freeCashFlowYield?: number | null;
  freeCashFlowYieldProvenance?: MetricProvenance;
};

export function deriveFxNormalizedProviderFcfYield(
  reported: ProviderReportedValuation,
  context: ComparisonFxContext | undefined,
): FxNormalizedProviderReportedValuation {
  void context;
  return reported;
}
