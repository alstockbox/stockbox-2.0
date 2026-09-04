import type {
  CompanyFundamentals,
  CompanySearchResult,
  ReitSpecializedMetrics,
  SpecializedMetric,
} from "@/lib/analysis/types";
import {
  SEC_CAPABILITIES,
  fetchCompanyFundamentalsResult as fetchCoreCompanyFundamentalsResult,
} from "./sec-core";
import { fetchSecReitSpecializedData } from "./sec-reit-specialized-provider";
import {
  providerDiagnostic,
  type AdapterResult,
  type FundamentalsProvider,
} from "./providers";

export * from "./sec-core";

function hasReportedValue(metric: SpecializedMetric | undefined): boolean {
  return typeof metric?.value === "number" && Number.isFinite(metric.value);
}

function mergeMetric<T extends SpecializedMetric>(base: T | undefined, incoming: T): T {
  return hasReportedValue(incoming) ? incoming : (base ?? incoming);
}

function mergeReitSpecialized(
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

function appendProviderDiagnostic(
  data: CompanyFundamentals,
  diagnostic: NonNullable<CompanyFundamentals["diagnostics"]>["providerDiagnostics"][number],
): CompanyFundamentals {
  const diagnostics = data.diagnostics;
  if (!diagnostics) return data;
  return {
    ...data,
    diagnostics: {
      ...diagnostics,
      providerDiagnostics: [...(diagnostics.providerDiagnostics ?? []), diagnostic],
    },
  };
}

export async function fetchCompanyFundamentalsResult(
  company: CompanySearchResult,
): Promise<AdapterResult<CompanyFundamentals>> {
  const core = await fetchCoreCompanyFundamentalsResult(company);
  if (!core.ok || core.data.analysisArchetype !== "reit") return core;

  try {
    const specialist = await fetchSecReitSpecializedData(company);
    if (!specialist.ok) {
      return {
        ...core,
        data: appendProviderDiagnostic(core.data, specialist.diagnostic),
      };
    }

    return {
      ...core,
      data: appendProviderDiagnostic(
        {
          ...core.data,
          specialized: mergeReitSpecialized(core.data.specialized, specialist.data),
        },
        specialist.diagnostic,
      ),
    };
  } catch {
    return {
      ...core,
      data: appendProviderDiagnostic(
        core.data,
        providerDiagnostic("SEC REIT filings", "specialized", "unavailable", "upstream_error"),
      ),
    };
  }
}

export async function fetchCompanyFundamentals(
  company: CompanySearchResult,
): Promise<CompanyFundamentals | null> {
  const result = await fetchCompanyFundamentalsResult(company);
  return result.ok ? result.data : null;
}

export const secFundamentalsProvider: FundamentalsProvider = {
  id: "sec-companyfacts",
  capabilities: SEC_CAPABILITIES,
  fetchFundamentals: fetchCompanyFundamentalsResult,
};
