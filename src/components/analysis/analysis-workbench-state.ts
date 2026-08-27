import type { CompanySearchResult, InvestmentProfile, UiMode } from "@/lib/analysis/types";
import { supportsLiveFundamentalsSecurity } from "@/lib/data/security-classification";

const INVESTMENT_PROFILES = new Set<InvestmentProfile>(["long_term", "short_term", "growth", "value", "quality", "dividend", "balanced"]);

export function analysisWorkbenchDefaults(profile: { uiMode?: unknown; investmentProfile?: unknown; experience?: unknown } | null | undefined): { mode: UiMode; investmentProfile: InvestmentProfile } {
  const mode: UiMode = profile?.uiMode === "pro" || profile?.uiMode === "simple" ? profile.uiMode : profile?.experience === "advanced" ? "pro" : "simple";
  const investmentProfile = typeof profile?.investmentProfile === "string" && INVESTMENT_PROFILES.has(profile.investmentProfile as InvestmentProfile) ? profile.investmentProfile as InvestmentProfile : "balanced";
  return { mode, investmentProfile };
}

function normalized(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function securitySelectionKey(company: CompanySearchResult): string {
  return [
    company.entityId ?? "",
    company.canonicalTicker ?? company.ticker,
    company.securityType ?? "Other",
    company.exchange ?? "",
  ]
    .map(normalized)
    .join("|");
}

export function formattedCompanySelection(company: CompanySearchResult): string {
  return `${company.canonicalTicker ?? company.ticker} - ${company.name}`;
}

export function queryRepresentsSelection(query: string, company: CompanySearchResult): boolean {
  const value = normalized(query);
  return [
    company.ticker,
    company.canonicalTicker ?? company.ticker,
    company.name,
    formattedCompanySelection(company),
  ].some((candidate) => normalized(candidate) === value);
}

export function selectionAfterQueryChange(
  selected: CompanySearchResult | null,
  query: string,
): CompanySearchResult | null {
  return selected && queryRepresentsSelection(query, selected) ? selected : null;
}

export function supportsLiveFundamentals(company: CompanySearchResult | null): boolean {
  return supportsLiveFundamentalsSecurity(company);
}

export function compactAnalysisCapability(company: CompanySearchResult): string {
  const fundamentals = supportsLiveFundamentals(company) ? "Fundamentals" : "Discovery only";
  const marketData = company.providerCapabilities?.marketData ? "Market data" : "No market data";
  return `${fundamentals} - ${marketData}`;
}
