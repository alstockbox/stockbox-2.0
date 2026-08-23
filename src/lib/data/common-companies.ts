import type { CompanySearchResult } from "@/lib/analysis/types";

const curatedCompanies: CompanySearchResult[] = [
  { ticker: "AAPL", name: "Apple Inc.", exchange: "NASDAQ", country: "US", cik: "0000320193" },
  { ticker: "MSFT", name: "Microsoft Corporation", exchange: "NASDAQ", country: "US", cik: "0000789019" },
  { ticker: "NVDA", name: "NVIDIA Corporation", exchange: "NASDAQ", country: "US", cik: "0001045810" },
  { ticker: "AMZN", name: "Amazon.com, Inc.", exchange: "NASDAQ", country: "US", cik: "0001018724" },
  { ticker: "GOOGL", name: "Alphabet Inc.", exchange: "NASDAQ", country: "US", cik: "0001652044" },
  { ticker: "META", name: "Meta Platforms, Inc.", exchange: "NASDAQ", country: "US", cik: "0001326801" },
  { ticker: "TSLA", name: "Tesla, Inc.", exchange: "NASDAQ", country: "US", cik: "0001318605" },
  { ticker: "BRK.B", name: "Berkshire Hathaway Inc.", exchange: "NYSE", country: "US", cik: "0001067983" },
  { ticker: "JPM", name: "JPMorgan Chase & Co.", exchange: "NYSE", country: "US", cik: "0000019617" },
  { ticker: "XOM", name: "ExxonMobil Holdings Corporation", exchange: "NYSE", country: "US", cik: "0002115436" },
  { ticker: "UNH", name: "UnitedHealth Group Incorporated", exchange: "NYSE", country: "US", cik: "0000731766" },
  { ticker: "O", name: "Realty Income Corporation", exchange: "NYSE", country: "US", cik: "0000726728", searchAliases: ["reit", "real estate investment trust"] },
  { ticker: "PLD", name: "Prologis, Inc.", exchange: "NYSE", country: "US", cik: "0001045609", searchAliases: ["reit", "real estate investment trust"] },
  { ticker: "VOLV.B", name: "AB Volvo", exchange: "Nasdaq Stockholm", country: "SE" },
  { ticker: "ERIC.B", name: "Telefonaktiebolaget LM Ericsson", exchange: "Nasdaq Stockholm", country: "SE" },
  { ticker: "HM.B", name: "H & M Hennes & Mauritz AB", exchange: "Nasdaq Stockholm", country: "SE" },
  { ticker: "INVE.B", name: "Investor AB", exchange: "Nasdaq Stockholm", country: "SE", searchAliases: ["Investor B", "INVE B", "INVE-B", "INVE B.ST"] }
];

export const commonCompanies: CompanySearchResult[] = curatedCompanies.map((company) => ({
  ...company,
  canonicalTicker: company.ticker,
  entityId: company.ticker === "XOM" ? "economic-company:xom" : company.cik ? `sec:${company.cik}` : `listing:${company.country ?? "unknown"}:${company.ticker}`,
  securityType: "Common Stock",
  providerCapabilities: {
    fundamentals: Boolean(company.cik),
    marketData: company.country === "US",
    providerIds: company.cik ? ["curated-catalog", "sec-companyfacts"] : ["curated-catalog"],
  },
}));
