import type { CompanySearchResult } from "@/lib/analysis/types";

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
  return Boolean(company?.providerCapabilities?.fundamentals ?? company?.cik);
}
