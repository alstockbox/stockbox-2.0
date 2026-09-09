import type { CompanySearchResult } from "@/lib/analysis/types";

export type FundStructure =
  | "exchange_traded_fund"
  | "closed_end_fund"
  | "other_fund"
  | "not_fund";

export type FundStructureClassification = {
  structure: FundStructure;
  confidence: number;
  reason: string;
};

const EXPLICIT_ETF_PATTERN = /\betf\b|\bexchange[-\s]traded\b|\bucits\s+etf\b/i;
const EXPLICIT_CLOSED_END_PATTERN = /\bclosed[-\s]?end(?:ed)?(?:\s+fund)?\b/i;
const CLOSED_END_TRUST_PATTERN = /\b(?:income|municipal|target\s+term|term|limited\s+duration|multi[-\s]?sector|micro[-\s]?cap|global|utility|healthcare|wellness|convertible|high\s+yield|tax[-\s]?free)\b.*\btrust\b/i;
const OPERATING_TRUST_PATTERN = /\b(?:bank|banc|realty|real\s+estate|reit|properties|property|mortgage|residential|industrial|office|retail)\b.*\btrust\b|\btrust\s+compan(?:y|ies)\b/i;

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export function classifyFundStructure(input: {
  company: CompanySearchResult;
  quoteType?: string | null;
  category?: string | null;
}): FundStructureClassification {
  const name = normalize(input.company.name);
  const category = normalize(input.category);
  const quoteType = normalize(input.quoteType);
  const combined = `${name} ${category}`.trim();
  const isFundSecurity = input.company.securityType === "ETF/Fund";

  const explicitEtfFromQuoteType = quoteType.toUpperCase() === "ETF";
  const explicitEtfFromText = EXPLICIT_ETF_PATTERN.test(combined);
  const explicitEtf = explicitEtfFromQuoteType || explicitEtfFromText;

  const explicitClosedEnd = EXPLICIT_CLOSED_END_PATTERN.test(combined);
  const closedEndTrust = CLOSED_END_TRUST_PATTERN.test(name)
    && !OPERATING_TRUST_PATTERN.test(name);
  const explicitCef = explicitClosedEnd || closedEndTrust;

  if (explicitEtf && explicitCef) {
    return {
      structure: "other_fund",
      confidence: 0.35,
      reason: "Conflicting ETF and closed-end fund evidence is present; fund structure is ambiguous and must not be guessed.",
    };
  }

  if (explicitCef) {
    return {
      structure: "closed_end_fund",
      confidence: explicitClosedEnd ? 0.95 : 0.88,
      reason: explicitClosedEnd
        ? "Explicit closed-end fund wording identifies a closed-end structure."
        : "Closed-end trust-style wording identifies a listed investment trust rather than an operating trust.",
    };
  }

  if (explicitEtf) {
    return {
      structure: "exchange_traded_fund",
      confidence: explicitEtfFromQuoteType ? 0.97 : 0.9,
      reason: explicitEtfFromQuoteType
        ? "Provider quote type explicitly identifies an exchange-traded fund."
        : "Issuer or category wording explicitly identifies an ETF or exchange-traded product.",
    };
  }

  if (!isFundSecurity) {
    return {
      structure: "not_fund",
      confidence: 0.95,
      reason: "Security metadata does not identify a fund, and no explicit ETF or closed-end fund evidence is present.",
    };
  }

  return {
    structure: "other_fund",
    confidence: 0.5,
    reason: "Fund security lacks high-confidence evidence distinguishing an ETF from a closed-end or other fund structure.",
  };
}
