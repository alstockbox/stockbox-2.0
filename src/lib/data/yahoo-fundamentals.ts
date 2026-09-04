import type {
  CompanyFundamentals,
  CompanySearchResult,
  ProviderDiagnostic,
} from "@/lib/analysis/types";
import {
  YAHOO_FUNDAMENTALS_CAPABILITIES,
  fetchYahooFundamentalsResult as fetchCoreYahooFundamentalsResult,
} from "./yahoo-fundamentals-core";
import { enrichSpecializedFundamentals } from "./specialized-enrichment";
import type { AdapterResult, FundamentalsProvider } from "./providers";

export * from "./yahoo-fundamentals-core";

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

export async function fetchYahooFundamentalsResult(
  company: CompanySearchResult,
): Promise<AdapterResult<CompanyFundamentals>> {
  const core = await fetchCoreYahooFundamentalsResult(company);
  if (!core.ok) return core;

  const enrichment = await enrichSpecializedFundamentals(company, core.data);
  return {
    ...core,
    data: appendUniqueDiagnostics(enrichment.fundamentals, enrichment.diagnostics),
  };
}

export const yahooFundamentalsProvider: FundamentalsProvider = {
  id: "yahoo-fundamentals",
  capabilities: YAHOO_FUNDAMENTALS_CAPABILITIES,
  fetchFundamentals: fetchYahooFundamentalsResult,
};
