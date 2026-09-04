import type {
  CompanyFundamentals,
  CompanySearchResult,
  ProviderDiagnostic,
} from "@/lib/analysis/types";

export type SpecializedEnrichmentResult = {
  fundamentals: CompanyFundamentals;
  diagnostics: ProviderDiagnostic[];
};

export async function enrichSpecializedFundamentals(
  _company: CompanySearchResult,
  fundamentals: CompanyFundamentals,
): Promise<SpecializedEnrichmentResult> {
  return { fundamentals, diagnostics: [] };
}
