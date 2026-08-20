import type { CompanySearchResult } from "@/lib/analysis/types";

export const commonCompanies: CompanySearchResult[] = [
  { ticker: "AAPL", name: "Apple Inc.", exchange: "NASDAQ", country: "US", cik: "0000320193" },
  { ticker: "MSFT", name: "Microsoft Corporation", exchange: "NASDAQ", country: "US", cik: "0000789019" },
  { ticker: "NVDA", name: "NVIDIA Corporation", exchange: "NASDAQ", country: "US", cik: "0001045810" },
  { ticker: "AMZN", name: "Amazon.com, Inc.", exchange: "NASDAQ", country: "US", cik: "0001018724" },
  { ticker: "GOOGL", name: "Alphabet Inc.", exchange: "NASDAQ", country: "US", cik: "0001652044" },
  { ticker: "META", name: "Meta Platforms, Inc.", exchange: "NASDAQ", country: "US", cik: "0001326801" },
  { ticker: "TSLA", name: "Tesla, Inc.", exchange: "NASDAQ", country: "US", cik: "0001318605" },
  { ticker: "BRK.B", name: "Berkshire Hathaway Inc.", exchange: "NYSE", country: "US", cik: "0001067983" },
  { ticker: "JPM", name: "JPMorgan Chase & Co.", exchange: "NYSE", country: "US", cik: "0000019617" },
  { ticker: "UNH", name: "UnitedHealth Group Incorporated", exchange: "NYSE", country: "US", cik: "0000731766" },
  { ticker: "VOLV.B", name: "AB Volvo", exchange: "Nasdaq Stockholm", country: "SE" },
  { ticker: "ERIC.B", name: "Telefonaktiebolaget LM Ericsson", exchange: "Nasdaq Stockholm", country: "SE" },
  { ticker: "HM.B", name: "H & M Hennes & Mauritz AB", exchange: "Nasdaq Stockholm", country: "SE" },
  { ticker: "INVE.B", name: "Investor AB", exchange: "Nasdaq Stockholm", country: "SE" }
];
