import type {
  AnalysisSource,
  CompanyFundamentals,
  CompanySearchResult,
  ProviderDiagnostic,
} from "@/lib/analysis/types";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type CvmBrazilProviderOptions = {
  fetchImpl?: FetchLike;
  useCache?: boolean;
  now?: () => number;
};

export type CvmBrazilDebtEnrichment = {
  fundamentals: CompanyFundamentals;
  supplemented: boolean;
  diagnostic: ProviderDiagnostic | null;
  source?: Omit<AnalysisSource, "accessedAt">;
};

export function resetCvmBrazilDatasetCacheForTests(): void {
  // Implemented with the provider cache.
}

export async function enrichBrazilFundamentalsWithCvmDebt(
  company: CompanySearchResult,
  fundamentals: CompanyFundamentals,
  options: CvmBrazilProviderOptions = {},
): Promise<CvmBrazilDebtEnrichment> {
  void company;
  void options;
  return {
    fundamentals,
    supplemented: false,
    diagnostic: null,
  };
}
