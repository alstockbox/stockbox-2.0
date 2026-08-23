import type { CompanySearchResult } from "@/lib/analysis/types";

export type EntityIdentity = {
  canonicalId: string;
  ticker: string;
  currentCik: string;
  predecessorCiks: string[];
  effectiveDates: Array<{ cik: string; from?: string; through?: string }>;
  evidence: string;
};

export const ENTITY_IDENTITIES: EntityIdentity[] = [
  {
    canonicalId: "economic-company:xom",
    ticker: "XOM",
    currentCik: "0002115436",
    predecessorCiks: ["0000034088"],
    effectiveDates: [
      { cik: "0000034088", through: "2026-06-30" },
      { cik: "0002115436", from: "2026-07-01" },
    ],
    evidence: "Configured SEC registrant succession for XOM supported by the July 2026 parent transition filings.",
  },
];

export function entityIdentityFor(company: Pick<CompanySearchResult, "ticker" | "canonicalTicker" | "cik">): EntityIdentity | null {
  const ticker = (company.canonicalTicker ?? company.ticker).trim().toUpperCase();
  const cik = company.cik?.replace(/\D/g, "").padStart(10, "0");
  return ENTITY_IDENTITIES.find((identity) =>
    identity.ticker === ticker
    && (!cik || identity.currentCik === cik || identity.predecessorCiks.includes(cik))) ?? null;
}
