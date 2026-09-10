import type { AnalysisSource, CompanySearchResult } from "@/lib/analysis/types";
import type { InvestmentCompanyKeyRatioYear } from "./official-investment-company-key-ratios";

const PROVIDER_ID = "official-investment-company-dividend-history";
const PROVIDER_VERSION = "official-investment-company-dividend-history-v1";
const LUNDBERGS_2025_ANNUAL_REPORT_URL = "https://www.lundbergforetagen.se/sites/default/files/2026-03/Lundbergs_Annual_Report_2025web.pdf";
const LUNDBERGS_DATA_AS_OF = "2025-12-31";

const LUNDBERGS_DIVIDEND_HISTORY: InvestmentCompanyKeyRatioYear[] = [
  { year: 2025, debtEquitiesRatio: 0, sharesOutstanding: 248_000_000, dividendsPaid: 1_141_000_000, dividendPerShare: 4.60, dividendsReceived: 3_414_000_000 },
  { year: 2024, debtEquitiesRatio: 0, sharesOutstanding: 248_000_000, dividendsPaid: 1_066_000_000, dividendPerShare: 4.30, dividendsReceived: 3_146_000_000 },
  { year: 2023, debtEquitiesRatio: 0, sharesOutstanding: 248_000_000, dividendsPaid: 992_000_000, dividendPerShare: 4.00, dividendsReceived: 3_000_000_000 },
  { year: 2022, debtEquitiesRatio: 0, sharesOutstanding: 248_000_000, dividendsPaid: 930_000_000, dividendPerShare: 3.75, dividendsReceived: 2_476_000_000 },
  { year: 2021, debtEquitiesRatio: 0, sharesOutstanding: 248_000_000, dividendsPaid: 868_000_000, dividendPerShare: 3.50, dividendsReceived: 2_415_000_000 },
];

export type OfficialInvestmentCompanyDividendHistoryData = {
  years: InvestmentCompanyKeyRatioYear[];
  source: AnalysisSource;
};

function normalizeIdentity(company: CompanySearchResult): string {
  return `${company.canonicalTicker ?? company.ticker} ${company.ticker} ${company.name}`
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, " ")
    .trim();
}

export function getOfficialInvestmentCompanyDividendHistory(
  company: CompanySearchResult,
): OfficialInvestmentCompanyDividendHistoryData | null {
  const identity = normalizeIdentity(company);
  const isLundbergs = /\blund(?:-[ab])?\.st\b/.test(identity)
    || identity.includes("lundbergföretagen")
    || identity.includes("lundbergforetagen");
  if (!isLundbergs) return null;

  const accessedAt = new Date().toISOString();
  return {
    years: LUNDBERGS_DIVIDEND_HISTORY.map((year) => ({ ...year })),
    source: {
      name: "Lundbergs Annual Report 2025 – dividend history",
      url: LUNDBERGS_2025_ANNUAL_REPORT_URL,
      accessedAt,
      freshness: "Issuer-published five-year cash-dividend history. Dividend per share is aligned to the actual cash payment year, not the later proposed dividend.",
      provider: PROVIDER_ID,
      version: PROVIDER_VERSION,
      capability: "specialized",
      dataAsOf: LUNDBERGS_DATA_AS_OF,
    },
  };
}
