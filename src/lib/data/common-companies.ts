import type { CompanySearchResult } from "@/lib/analysis/types";

const curatedCompanies: CompanySearchResult[] = [
  { ticker: "AAPL", name: "Apple Inc.", exchange: "NASDAQ", country: "US", cik: "0000320193", searchAliases: ["Apple"] },
  { ticker: "MSFT", name: "Microsoft Corporation", exchange: "NASDAQ", country: "US", cik: "0000789019" },
  { ticker: "NVDA", name: "NVIDIA Corporation", exchange: "NASDAQ", country: "US", cik: "0001045810", searchAliases: ["NVIDIA"] },
  { ticker: "AMZN", name: "Amazon.com, Inc.", exchange: "NASDAQ", country: "US", cik: "0001018724", searchAliases: ["Amazon"] },
  { ticker: "GOOGL", name: "Alphabet Inc.", exchange: "NASDAQ", country: "US", cik: "0001652044", searchAliases: ["Alphabet", "Google"] },
  { ticker: "META", name: "Meta Platforms, Inc.", exchange: "NASDAQ", country: "US", cik: "0001326801", searchAliases: ["Meta"] },
  { ticker: "TSLA", name: "Tesla, Inc.", exchange: "NASDAQ", country: "US", cik: "0001318605" },
  { ticker: "BRK.B", name: "Berkshire Hathaway Inc.", exchange: "NYSE", country: "US", cik: "0001067983", searchAliases: ["Berkshire", "Berkshire B", "BRK B"] },
  { ticker: "JPM", name: "JPMorgan Chase & Co.", exchange: "NYSE", country: "US", cik: "0000019617", searchAliases: ["JPMorgan", "JPMorgan Chase"] },
  { ticker: "XOM", name: "ExxonMobil Holdings Corporation", exchange: "NYSE", country: "US", cik: "0002115436" },
  { ticker: "UNH", name: "UnitedHealth Group Incorporated", exchange: "NYSE", country: "US", cik: "0000731766" },
  { ticker: "O", name: "Realty Income Corporation", exchange: "NYSE", country: "US", cik: "0000726728", searchAliases: ["reit", "real estate investment trust"] },
  { ticker: "PLD", name: "Prologis, Inc.", exchange: "NYSE", country: "US", cik: "0001045609", searchAliases: ["reit", "real estate investment trust"] },
  { ticker: "VOLV.B", canonicalTicker: "VOLV-B.ST", name: "AB Volvo", exchange: "Nasdaq Stockholm", country: "SE", currency: "SEK", entityId: "economic-company:volvo", searchAliases: ["Volvo", "VOLV B", "VOLV.B", "VOLV-B.ST"] },
  { ticker: "ERIC.B", name: "Telefonaktiebolaget LM Ericsson", exchange: "Nasdaq Stockholm", country: "SE" },
  { ticker: "HM.B", name: "H & M Hennes & Mauritz AB", exchange: "Nasdaq Stockholm", country: "SE" },
  { ticker: "INVE.B", name: "Investor AB", exchange: "Nasdaq Stockholm", country: "SE", currency: "SEK", searchAliases: ["Investor", "Investor B", "INVE B", "INVE-B", "INVE B.ST"] },
  { ticker: "ABB", name: "ABB Ltd ADR", exchange: "NYSE", country: "US", currency: "USD", entityId: "economic-company:abb", securityType: "ADR", searchAliases: ["ABB ADR"] },
  { ticker: "ABBN.SW", name: "ABB Ltd", exchange: "SIX Swiss Exchange", country: "CH", currency: "CHF", entityId: "economic-company:abb", searchAliases: ["ABB Switzerland"] },
  { ticker: "ABB.ST", name: "ABB Ltd", exchange: "Nasdaq Stockholm", country: "SE", currency: "SEK", entityId: "economic-company:abb", searchAliases: ["ABB Sweden"] },
  { ticker: "NVO", name: "Novo Nordisk A/S ADR", exchange: "NYSE", country: "US", currency: "USD", entityId: "economic-company:novo-nordisk", securityType: "ADR", searchAliases: ["Novo Nordisk"] },
  { ticker: "NOVO-B.CO", name: "Novo Nordisk A/S Class B", exchange: "Nasdaq Copenhagen", country: "DK", currency: "DKK", entityId: "economic-company:novo-nordisk", searchAliases: ["Novo Nordisk", "NOVO B"] },
  { ticker: "TM", name: "Toyota Motor Corporation ADR", exchange: "NYSE", country: "US", currency: "USD", entityId: "economic-company:toyota", securityType: "ADR", searchAliases: ["Toyota"] },
  { ticker: "7203.T", name: "Toyota Motor Corporation", exchange: "Tokyo Stock Exchange", country: "JP", currency: "JPY", entityId: "economic-company:toyota", searchAliases: ["Toyota"] },
  { ticker: "ASML", name: "ASML Holding N.V. ADR", exchange: "NASDAQ", country: "US", currency: "USD", entityId: "economic-company:asml", securityType: "ADR", searchAliases: ["ASML"] },
  { ticker: "ASML.AS", name: "ASML Holding N.V.", exchange: "Euronext Amsterdam", country: "NL", currency: "EUR", entityId: "economic-company:asml", searchAliases: ["ASML"] },
  { ticker: "ROG.SW", name: "Roche Holding AG", exchange: "SIX Swiss Exchange", country: "CH", currency: "CHF", entityId: "economic-company:roche", searchAliases: ["Roche"] },
  { ticker: "NESN.SW", name: "Nestle S.A.", exchange: "SIX Swiss Exchange", country: "CH", currency: "CHF", entityId: "economic-company:nestle", searchAliases: ["Nestle"] },
  { ticker: "NOK", name: "Nokia Oyj ADR", exchange: "NYSE", country: "US", currency: "USD", entityId: "economic-company:nokia", securityType: "ADR", searchAliases: ["Nokia"] },
  { ticker: "NOKIA.HE", name: "Nokia Oyj", exchange: "Nasdaq Helsinki", country: "FI", currency: "EUR", entityId: "economic-company:nokia", searchAliases: ["Nokia"] },
  { ticker: "MU", name: "Micron Technology, Inc.", exchange: "NASDAQ", country: "US", currency: "USD", cik: "0000723125", searchAliases: ["Micro", "Micron"] },
  { ticker: "MCHP", name: "Microchip Technology Incorporated", exchange: "NASDAQ", country: "US", currency: "USD", cik: "0000827054", searchAliases: ["Micro", "Microchip"] }
];

export const commonCompanies: CompanySearchResult[] = curatedCompanies.map((company) => ({
  ...company,
  canonicalTicker: company.canonicalTicker ?? company.ticker,
  entityId: company.entityId ?? (company.ticker === "XOM" ? "economic-company:xom" : company.cik ? `sec:${company.cik}` : `listing:${company.country ?? "unknown"}:${company.ticker}`),
  securityType: company.securityType ?? "Common Stock",
  primarySecurity: company.primarySecurity ?? company.securityType !== "ADR",
  providerCapabilities: {
    fundamentals: Boolean(company.cik),
    marketData: company.providerCapabilities?.marketData ?? true,
    providerIds: company.cik ? ["curated-catalog", "sec-companyfacts"] : ["curated-catalog"],
  },
}));
