import type {
  CompanyFundamentals,
  CompanySearchResult,
  ProviderDiagnostic,
  ReitSpecializedMetrics,
  SpecializedMetric,
} from "@/lib/analysis/types";
import { providerDiagnostic } from "./providers";
import { fetchSecReitSpecializedData } from "./sec-reit-specialized-provider";

const SEC_REIT_PROVIDER = "SEC REIT filings";

export type SpecializedEnrichmentResult = {
  fundamentals: CompanyFundamentals;
  diagnostics: ProviderDiagnostic[];
};

function hasValue(metric: SpecializedMetric | undefined): boolean {
  return typeof metric?.value === "number" && Number.isFinite(metric.value);
}

function mergeMetric<T extends SpecializedMetric>(base: T | undefined, incoming: T): T {
  return hasValue(incoming) ? incoming : (base ?? incoming);
}

export function mergeReitSpecializedMetrics(
  base: CompanyFundamentals["specialized"],
  incoming: ReitSpecializedMetrics,
): ReitSpecializedMetrics {
  const current = base?.kind === "reit" ? base : undefined;
  return {
    kind: "reit",
    fundsFromOperations: mergeMetric(current?.fundsFromOperations, incoming.fundsFromOperations),
    fundsFromOperationsPerShare: mergeMetric(current?.fundsFromOperationsPerShare, incoming.fundsFromOperationsPerShare),
    adjustedFundsFromOperations: mergeMetric(current?.adjustedFundsFromOperations, incoming.adjustedFundsFromOperations),
    adjustedFundsFromOperationsPerShare: mergeMetric(current?.adjustedFundsFromOperationsPerShare, incoming.adjustedFundsFromOperationsPerShare),
    fundsFromOperationsGrowth: mergeMetric(current?.fundsFromOperationsGrowth, incoming.fundsFromOperationsGrowth),
    adjustedFundsFromOperationsGrowth: mergeMetric(current?.adjustedFundsFromOperationsGrowth, incoming.adjustedFundsFromOperationsGrowth),
    adjustedFundsFromOperationsPayout: mergeMetric(current?.adjustedFundsFromOperationsPayout, incoming.adjustedFundsFromOperationsPayout),
    dividendCoverage: mergeMetric(current?.dividendCoverage, incoming.dividendCoverage),
    occupancy: mergeMetric(current?.occupancy, incoming.occupancy),
    sameStoreNoiGrowth: mergeMetric(current?.sameStoreNoiGrowth, incoming.sameStoreNoiGrowth),
    netDebtToEbitdare: mergeMetric(current?.netDebtToEbitdare, incoming.netDebtToEbitdare),
    debtMaturities: mergeMetric(current?.debtMaturities, incoming.debtMaturities),
    fixedChargeCoverage: mergeMetric(current?.fixedChargeCoverage, incoming.fixedChargeCoverage),
    netAssetValue: mergeMetric(current?.netAssetValue, incoming.netAssetValue),
  };
}

function previousSecReitDiagnostic(fundamentals: CompanyFundamentals): ProviderDiagnostic | null {
  return fundamentals.diagnostics?.providerDiagnostics?.find((diagnostic) =>
    diagnostic.provider === SEC_REIT_PROVIDER && diagnostic.capability === "specialized"
  ) ?? null;
}

export async function enrichSpecializedFundamentals(
  company: CompanySearchResult,
  fundamentals: CompanyFundamentals,
): Promise<SpecializedEnrichmentResult> {
  if (fundamentals.analysisArchetype !== "reit") {
    return { fundamentals, diagnostics: [] };
  }

  const previous = previousSecReitDiagnostic(fundamentals);
  if (previous) {
    return { fundamentals, diagnostics: [previous] };
  }

  if (!company.cik) {
    return {
      fundamentals,
      diagnostics: [providerDiagnostic(
        SEC_REIT_PROVIDER,
        "specialized",
        "unsupported",
        "unsupported_symbol",
      )],
    };
  }

  try {
    const result = await fetchSecReitSpecializedData(company);
    if (!result.ok) {
      return { fundamentals, diagnostics: [result.diagnostic] };
    }
    return {
      fundamentals: {
        ...fundamentals,
        specialized: mergeReitSpecializedMetrics(fundamentals.specialized, result.data),
      },
      diagnostics: [result.diagnostic],
    };
  } catch {
    return {
      fundamentals,
      diagnostics: [providerDiagnostic(
        SEC_REIT_PROVIDER,
        "specialized",
        "unavailable",
        "upstream_error",
      )],
    };
  }
}
