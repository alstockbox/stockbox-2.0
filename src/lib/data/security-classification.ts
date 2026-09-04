import type { CompanySearchResult } from "@/lib/analysis/types";

const ADR_PATTERN = /\badr\b|american depositary|depositary receipt/i;
const FUND_PRODUCT_PATTERN = /\betf\b|\bfund\b|mutual fund|index fund|ucits|sicav|portfolio|tracker|exchange[-\s]traded|trust index/i;
const CLOSED_END_TRUST_PATTERN = /\b(?:income|municipal|target term|term|limited duration|multi[-\s]sector|micro[-\s]cap|global|utility|healthcare\s*(?:&|and)\s*wellness|convertible|high yield|tax[-\s]free)\b.*\btrust\b|\btrust\b.*\b(?:income|municipal|target term|term|limited duration|multi[-\s]sector|micro[-\s]cap|global|utility|healthcare\s*(?:&|and)\s*wellness|convertible|high yield|tax[-\s]free)\b/i;
const OPERATING_TRUST_PATTERN = /\b(?:bank|banc|realty|real estate|reit|properties|property|mortgage|residential|industrial|office|retail)\b.*\btrust\b|\btrust company\b/i;
const PREFERRED_NAME_PATTERN = /preferred|preference|depositary shares|\bpfd\b/i;
const PREFERRED_TICKER_PATTERN = /(?:^|\s)[A-Z0-9]+-P[A-Z]?(?=\s|$)/i;
const BRAZIL_PREFERRED_TICKER_PATTERN = /(?:^|\s)[A-Z]{4,6}[456]\.SA(?=\s|$)/i;
const GERMANY_CLASS3_PREFERRED_TICKER_PATTERN = /(?:^|\s)[A-Z]{2,5}3\.DE(?=\s|$)/i;
const BRAZIL_COMPLEX_UNIT_PATTERN = /(?:^|\s)[A-Z]{4,6}11\.SA(?=\s|$)/i;
const MEXICO_COMPLEX_SECURITY_PATTERN = /(?:^|\s)[A-Z0-9.-]*(?:UBD|UB|CPO)\.MX(?=\s|$)/i;
const OPERATING_COMPANY_LEGAL_FORM_PATTERN = /\b(?:ab|asa|plc|limited|ltd\.?|inc\.?|incorporated|corp\.?|corporation|company|ag|n\.?v\.?|oyj|a\/s|s\.?a\.?|s\.?p\.?a\.?)\b/i;
const KNOWN_SECURITY_TYPE_OVERRIDES = new Map<string, NonNullable<CompanySearchResult["securityType"]>>([
  ["ROP.SW", "Other"], // Roche participation certificate (SIX), not a bearer/common share.
]);

function textForSecurity(company: CompanySearchResult): string {
  return [
    company.ticker,
    company.canonicalTicker,
    company.localTicker,
    company.name,
  ].filter(Boolean).join(" ");
}

function inferredTypeFromText(company: CompanySearchResult): CompanySearchResult["securityType"] | null {
  const tickerOverride = [company.canonicalTicker, company.ticker]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.trim().toUpperCase())
    .map((value) => KNOWN_SECURITY_TYPE_OVERRIDES.get(value))
    .find((value): value is NonNullable<CompanySearchResult["securityType"]> => Boolean(value));
  if (tickerOverride) return tickerOverride;
  const text = textForSecurity(company);
  if (ADR_PATTERN.test(text)) return "ADR";
  if (FUND_PRODUCT_PATTERN.test(text) || (CLOSED_END_TRUST_PATTERN.test(text) && !OPERATING_TRUST_PATTERN.test(text))) return "ETF/Fund";
  if (PREFERRED_NAME_PATTERN.test(text) || PREFERRED_TICKER_PATTERN.test(text) || BRAZIL_PREFERRED_TICKER_PATTERN.test(text) || GERMANY_CLASS3_PREFERRED_TICKER_PATTERN.test(text)) return "Preferred";
  if (BRAZIL_COMPLEX_UNIT_PATTERN.test(text) || MEXICO_COMPLEX_SECURITY_PATTERN.test(text)) return "Other";
  if (company.securityType === "ETF/Fund" && OPERATING_COMPANY_LEGAL_FORM_PATTERN.test(company.name)) return "Common Stock";
  return null;
}

export function inferSecurityType(company: CompanySearchResult): NonNullable<CompanySearchResult["securityType"]> {
  const inferred = inferredTypeFromText(company);
  if (inferred) return inferred;
  return company.securityType ?? "Common Stock";
}

export function supportsLiveFundamentalsSecurity(company: CompanySearchResult | null): boolean {
  return company ? canAttemptConfiguredFundamentals(company) : false;
}

export function canAttemptConfiguredFundamentals(company: CompanySearchResult): boolean {
  const securityType = inferSecurityType(company);
  if (securityType === "Common Stock") return true;
  if (securityType === "ADR") return company.providerCapabilities?.fundamentals === true;
  return false;
}
