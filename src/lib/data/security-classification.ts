import type { CompanySearchResult } from "@/lib/analysis/types";

const ADR_PATTERN = /\badr\b|american depositary|depositary receipt/i;
const ETF_FUND_PATTERN = /\betf\b|\bfund\b|portfolio|trust index/i;
const PREFERRED_NAME_PATTERN = /preferred|preference|depositary shares|\bpfd\b/i;
const PREFERRED_TICKER_PATTERN = /(?:^|\s)[A-Z0-9]+-P[A-Z]?(?=\s|$)/i;
const BRAZIL_PREFERRED_TICKER_PATTERN = /(?:^|\s)[A-Z]{4,6}[456]\.SA(?=\s|$)/i;
const GERMANY_CLASS3_PREFERRED_TICKER_PATTERN = /(?:^|\s)[A-Z]{2,5}3\.DE(?=\s|$)/i;
const BRAZIL_COMPLEX_UNIT_PATTERN = /(?:^|\s)[A-Z]{4,6}11\.SA(?=\s|$)/i;
const MEXICO_COMPLEX_SECURITY_PATTERN = /(?:^|\s)[A-Z0-9.-]*(?:UBD|UB|CPO)\.MX(?=\s|$)/i;

function textForSecurity(company: CompanySearchResult): string {
  return [
    company.ticker,
    company.canonicalTicker,
    company.localTicker,
    company.name,
  ].filter(Boolean).join(" ");
}

function inferredTypeFromText(company: CompanySearchResult): CompanySearchResult["securityType"] | null {
  const text = textForSecurity(company);
  if (ADR_PATTERN.test(text)) return "ADR";
  if (ETF_FUND_PATTERN.test(text)) return "ETF/Fund";
  if (PREFERRED_NAME_PATTERN.test(text) || PREFERRED_TICKER_PATTERN.test(text) || BRAZIL_PREFERRED_TICKER_PATTERN.test(text) || GERMANY_CLASS3_PREFERRED_TICKER_PATTERN.test(text)) return "Preferred";
  if (BRAZIL_COMPLEX_UNIT_PATTERN.test(text) || MEXICO_COMPLEX_SECURITY_PATTERN.test(text)) return "Other";
  return null;
}

export function inferSecurityType(company: CompanySearchResult): NonNullable<CompanySearchResult["securityType"]> {
  const inferred = inferredTypeFromText(company);
  if (inferred) return inferred;
  return company.securityType ?? "Common Stock";
}

export function supportsLiveFundamentalsSecurity(company: CompanySearchResult | null): boolean {
  if (!company) return false;
  if (inferSecurityType(company) !== "Common Stock") return false;
  return Boolean(company.providerCapabilities?.fundamentals ?? company.cik);
}

export function canAttemptConfiguredFundamentals(company: CompanySearchResult): boolean {
  if (inferSecurityType(company) !== "Common Stock") return false;
  return true;
}
