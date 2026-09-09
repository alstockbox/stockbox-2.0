import type { CompanySearchResult } from "./types";

export const MARKET_BENCHMARK_POLICY_VERSION_V3 = "stockbox-market-benchmark-v3.0.0" as const;

export type MarketBenchmarkV3 = {
  policyVersion: typeof MARKET_BENCHMARK_POLICY_VERSION_V3;
  ticker: string;
  market: string;
  source: "ticker_suffix" | "country" | "exchange";
};

type BenchmarkDefinition = { ticker: string; market: string };

const BY_SUFFIX: Array<[string, BenchmarkDefinition]> = [
  [".TWO", { ticker: "^TWII", market: "Taiwan" }],
  [".ST", { ticker: "^OMX", market: "Sweden" }],
  [".L", { ticker: "^FTSE", market: "United Kingdom" }],
  [".DE", { ticker: "^GDAXI", market: "Germany" }],
  [".F", { ticker: "^GDAXI", market: "Germany" }],
  [".PA", { ticker: "^FCHI", market: "France" }],
  [".AS", { ticker: "^AEX", market: "Netherlands" }],
  [".SW", { ticker: "^SSMI", market: "Switzerland" }],
  [".TO", { ticker: "^GSPTSE", market: "Canada" }],
  [".V", { ticker: "^GSPTSE", market: "Canada" }],
  [".AX", { ticker: "^AXJO", market: "Australia" }],
  [".T", { ticker: "^N225", market: "Japan" }],
  [".HK", { ticker: "^HSI", market: "Hong Kong" }],
  [".SS", { ticker: "000001.SS", market: "China" }],
  [".SZ", { ticker: "000001.SS", market: "China" }],
  [".KS", { ticker: "^KS11", market: "South Korea" }],
  [".KQ", { ticker: "^KS11", market: "South Korea" }],
  [".TW", { ticker: "^TWII", market: "Taiwan" }],
  [".NS", { ticker: "^NSEI", market: "India" }],
  [".BO", { ticker: "^BSESN", market: "India" }],
  [".SA", { ticker: "^BVSP", market: "Brazil" }],
  [".MX", { ticker: "^MXX", market: "Mexico" }],
  [".BA", { ticker: "^MERV", market: "Argentina" }],
  [".MC", { ticker: "^IBEX", market: "Spain" }],
  [".MI", { ticker: "FTSEMIB.MI", market: "Italy" }],
  [".CO", { ticker: "^OMXC25", market: "Denmark" }],
  [".HE", { ticker: "^OMXH25", market: "Finland" }],
  [".OL", { ticker: "OSEAX.OL", market: "Norway" }],
  [".SI", { ticker: "^STI", market: "Singapore" }],
  [".JK", { ticker: "^JKSE", market: "Indonesia" }],
  [".KL", { ticker: "^KLSE", market: "Malaysia" }],
  [".NZ", { ticker: "^NZ50", market: "New Zealand" }],
];

const BY_COUNTRY: Record<string, BenchmarkDefinition> = {
  US: { ticker: "^GSPC", market: "United States" },
  "UNITED STATES": { ticker: "^GSPC", market: "United States" },
  SE: { ticker: "^OMX", market: "Sweden" },
  SWEDEN: { ticker: "^OMX", market: "Sweden" },
  GB: { ticker: "^FTSE", market: "United Kingdom" },
  UK: { ticker: "^FTSE", market: "United Kingdom" },
  "UNITED KINGDOM": { ticker: "^FTSE", market: "United Kingdom" },
  DE: { ticker: "^GDAXI", market: "Germany" },
  GERMANY: { ticker: "^GDAXI", market: "Germany" },
  FR: { ticker: "^FCHI", market: "France" },
  FRANCE: { ticker: "^FCHI", market: "France" },
  NL: { ticker: "^AEX", market: "Netherlands" },
  NETHERLANDS: { ticker: "^AEX", market: "Netherlands" },
  CH: { ticker: "^SSMI", market: "Switzerland" },
  SWITZERLAND: { ticker: "^SSMI", market: "Switzerland" },
  CA: { ticker: "^GSPTSE", market: "Canada" },
  CANADA: { ticker: "^GSPTSE", market: "Canada" },
  AU: { ticker: "^AXJO", market: "Australia" },
  AUSTRALIA: { ticker: "^AXJO", market: "Australia" },
  JP: { ticker: "^N225", market: "Japan" },
  JAPAN: { ticker: "^N225", market: "Japan" },
  HK: { ticker: "^HSI", market: "Hong Kong" },
  "HONG KONG": { ticker: "^HSI", market: "Hong Kong" },
  CN: { ticker: "000001.SS", market: "China" },
  CHINA: { ticker: "000001.SS", market: "China" },
  KR: { ticker: "^KS11", market: "South Korea" },
  "SOUTH KOREA": { ticker: "^KS11", market: "South Korea" },
  TW: { ticker: "^TWII", market: "Taiwan" },
  TAIWAN: { ticker: "^TWII", market: "Taiwan" },
  IN: { ticker: "^NSEI", market: "India" },
  INDIA: { ticker: "^NSEI", market: "India" },
  BR: { ticker: "^BVSP", market: "Brazil" },
  BRAZIL: { ticker: "^BVSP", market: "Brazil" },
  MX: { ticker: "^MXX", market: "Mexico" },
  MEXICO: { ticker: "^MXX", market: "Mexico" },
  AR: { ticker: "^MERV", market: "Argentina" },
  ARGENTINA: { ticker: "^MERV", market: "Argentina" },
  ES: { ticker: "^IBEX", market: "Spain" },
  SPAIN: { ticker: "^IBEX", market: "Spain" },
  IT: { ticker: "FTSEMIB.MI", market: "Italy" },
  ITALY: { ticker: "FTSEMIB.MI", market: "Italy" },
  DK: { ticker: "^OMXC25", market: "Denmark" },
  DENMARK: { ticker: "^OMXC25", market: "Denmark" },
  FI: { ticker: "^OMXH25", market: "Finland" },
  FINLAND: { ticker: "^OMXH25", market: "Finland" },
  NO: { ticker: "OSEAX.OL", market: "Norway" },
  NORWAY: { ticker: "OSEAX.OL", market: "Norway" },
  SG: { ticker: "^STI", market: "Singapore" },
  SINGAPORE: { ticker: "^STI", market: "Singapore" },
  ID: { ticker: "^JKSE", market: "Indonesia" },
  INDONESIA: { ticker: "^JKSE", market: "Indonesia" },
  MY: { ticker: "^KLSE", market: "Malaysia" },
  MALAYSIA: { ticker: "^KLSE", market: "Malaysia" },
  NZ: { ticker: "^NZ50", market: "New Zealand" },
  "NEW ZEALAND": { ticker: "^NZ50", market: "New Zealand" },
};

const BY_EXCHANGE: Record<string, BenchmarkDefinition> = {
  AMEX: BY_COUNTRY.US,
  NASDAQ: BY_COUNTRY.US,
  NASDAQCM: BY_COUNTRY.US,
  NASDAQGM: BY_COUNTRY.US,
  NASDAQGS: BY_COUNTRY.US,
  "NASDAQ CAPITAL MARKET": BY_COUNTRY.US,
  "NASDAQ GLOBAL MARKET": BY_COUNTRY.US,
  "NASDAQ GLOBAL SELECT": BY_COUNTRY.US,
  "NEW YORK STOCK EXCHANGE": BY_COUNTRY.US,
  NYQ: BY_COUNTRY.US,
  NYSE: BY_COUNTRY.US,
  "NYSE AMERICAN": BY_COUNTRY.US,
  NYSEAMERICAN: BY_COUNTRY.US,
  "NYSE ARCA": BY_COUNTRY.US,
  "NYSE MKT": BY_COUNTRY.US,
  BATS: BY_COUNTRY.US,
  "BATS TRADING": BY_COUNTRY.US,
  BZX: BY_COUNTRY.US,
  "CBOE BZX": BY_COUNTRY.US,
  OTC: BY_COUNTRY.US,
  "OTC MARKETS": BY_COUNTRY.US,
  OTCQB: BY_COUNTRY.US,
  OTCQX: BY_COUNTRY.US,
  FRANKFURT: BY_COUNTRY.DE,
  "FRANKFURT STOCK EXCHANGE": BY_COUNTRY.DE,
  "BUENOS AIRES": BY_COUNTRY.AR,
  "BUENOS AIRES STOCK EXCHANGE": BY_COUNTRY.AR,
};

function result(definition: BenchmarkDefinition, source: MarketBenchmarkV3["source"]): MarketBenchmarkV3 {
  return { policyVersion: MARKET_BENCHMARK_POLICY_VERSION_V3, ...definition, source };
}

export function benchmarkForCompanyV3(company: CompanySearchResult): MarketBenchmarkV3 | null {
  const ticker = (company.canonicalTicker ?? company.ticker).trim().toUpperCase();
  const suffix = BY_SUFFIX.find(([candidate]) => ticker.endsWith(candidate));
  if (suffix) return result(suffix[1], "ticker_suffix");

  const country = company.country?.trim().toUpperCase() ?? "";
  if (country && BY_COUNTRY[country]) return result(BY_COUNTRY[country], "country");

  const exchange = company.exchange?.trim().toUpperCase() ?? "";
  const compactExchange = exchange.replace(/[^A-Z0-9]/g, "");
  const exchangeDefinition = BY_EXCHANGE[exchange] ?? BY_EXCHANGE[compactExchange];
  return exchangeDefinition ? result(exchangeDefinition, "exchange") : null;
}

/**
 * Outcome calibration must compare like with like. A fund's listing venue does
 * not identify its economic exposure: a US-listed ETF can track global equity,
 * bonds, commodities, a sector, a factor, or a daily-reset leveraged index.
 * Until StockBox has verified benchmark/index attribution in the specialist
 * evidence, ETF outcomes remain intentionally unbenchmarked. Their absolute
 * returns are still persisted, while excess-return and hit-rate evidence stay
 * null and therefore cannot contaminate calibration.
 *
 * Investment companies remain equity securities, so their listing-market
 * benchmark is retained. Ordinary operating-company archetypes are unchanged.
 */
export function benchmarkForRecommendationOutcomeV3(
  company: CompanySearchResult,
  analysisArchetype: string,
): MarketBenchmarkV3 | null {
  const archetype = analysisArchetype.trim().toLowerCase();
  if (archetype.startsWith("etf:")) return null;
  return benchmarkForCompanyV3(company);
}

export function benchmarkCompanySelectionV3(benchmark: MarketBenchmarkV3): CompanySearchResult {
  return {
    ticker: benchmark.ticker,
    canonicalTicker: benchmark.ticker,
    localTicker: benchmark.ticker,
    name: `${benchmark.market} broad market benchmark`,
    securityType: "Other",
    source: `stockbox:${MARKET_BENCHMARK_POLICY_VERSION_V3}`,
    primarySecurity: true,
  };
}
