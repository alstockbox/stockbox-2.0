import { classifyUniversalSecurity, type EtfAnalysisInput, type EtfHolding } from "@/lib/analysis/universal-security";
import type { AnalysisSource, CompanySearchResult, ProviderDiagnostic } from "@/lib/analysis/types";
import { yahooSymbolForCompany } from "./yahoo-fundamentals";

const PROVIDER_ID = "yahoo-etf";
const REQUEST_TIMEOUT_MS = 10_000;

type JsonObject = Record<string, unknown>;

export type YahooEtfData = {
  input: EtfAnalysisInput;
  category: string | null;
  fundFamily: string | null;
  quoteType: string | null;
  source: AnalysisSource;
  diagnostic: ProviderDiagnostic;
};

export type YahooEtfResult =
  | { ok: true; data: YahooEtfData }
  | { ok: false; message: string; diagnostic: ProviderDiagnostic };

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = object(value)?.raw;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = numberValue(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const parsed = stringValue(value) ?? stringValue(object(value)?.fmt);
    if (parsed) return parsed;
  }
  return null;
}

function providerDiagnostic(status: ProviderDiagnostic["status"], reason?: string): ProviderDiagnostic {
  return {
    provider: "Yahoo Finance ETF metadata",
    capability: "specialized",
    status,
    reason,
    observedAt: new Date().toISOString(),
  };
}

async function getJson(url: string): Promise<JsonObject | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 StockBox/2.0",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return object(await response.json().catch(() => null));
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function quoteSummaryResult(payload: JsonObject | null): JsonObject | null {
  const quoteSummary = object(payload?.quoteSummary);
  const result = Array.isArray(quoteSummary?.result) ? quoteSummary.result : [];
  return object(result[0]);
}

function quoteResult(payload: JsonObject | null): JsonObject | null {
  const quoteResponse = object(payload?.quoteResponse);
  const result = Array.isArray(quoteResponse?.result) ? quoteResponse.result : [];
  return object(result[0]);
}

function parseHolding(value: unknown): EtfHolding | null {
  const row = object(value);
  if (!row) return null;
  const name = firstString(row.holdingName, row.longName, row.shortName, row.symbol);
  const weight = firstNumber(row.holdingPercent, row.weight, row.percentAssets);
  if (!name || weight === null || weight <= 0) return null;
  return {
    ticker: firstString(row.symbol) ?? undefined,
    name,
    weight,
  };
}

function parseSectorHhi(topHoldings: JsonObject | null): number | null {
  const values = Array.isArray(topHoldings?.sectorWeightings) ? topHoldings.sectorWeightings : [];
  const weights = values.flatMap((entry) => {
    const row = object(entry);
    if (!row) return [];
    const weight = firstNumber(...Object.values(row));
    return weight !== null && weight >= 0 ? [weight] : [];
  });
  if (!weights.length) return null;
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return null;
  return weights.reduce((sum, value) => sum + (value / total) ** 2, 0);
}

function holdingConcentration(holdings: EtfHolding[]) {
  const weights = holdings.map((holding) => holding.weight > 1.5 ? holding.weight / 100 : holding.weight).sort((a, b) => b - a);
  return {
    top10Weight: weights.length ? weights.slice(0, 10).reduce((sum, value) => sum + value, 0) : null,
    largestHoldingWeight: weights[0] ?? null,
    holdingsHhi: weights.length ? weights.reduce((sum, value) => sum + value ** 2, 0) : null,
  };
}

function inceptionAgeYears(timestamp: number | null): number | null {
  if (timestamp === null) return null;
  const milliseconds = timestamp > 10_000_000_000 ? timestamp : timestamp * 1000;
  const age = (Date.now() - milliseconds) / (365.2425 * 86_400_000);
  return Number.isFinite(age) && age >= 0 ? age : null;
}

function bidAskSpread(quote: JsonObject | null): number | null {
  const bid = firstNumber(quote?.bid);
  const ask = firstNumber(quote?.ask);
  if (bid === null || ask === null || bid <= 0 || ask <= 0 || ask < bid) return null;
  const midpoint = (bid + ask) / 2;
  return midpoint > 0 ? (ask - bid) / midpoint : null;
}

export async function fetchYahooEtfData(company: CompanySearchResult): Promise<YahooEtfResult> {
  const symbol = yahooSymbolForCompany(company);
  const modules = ["fundProfile", "topHoldings", "summaryDetail", "defaultKeyStatistics", "fundPerformance", "risk"].join(",");
  const summaryUrl = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${encodeURIComponent(modules)}`;
  const quoteUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
  const [summaryPayload, quotePayload] = await Promise.all([getJson(summaryUrl), getJson(quoteUrl)]);
  const summary = quoteSummaryResult(summaryPayload);
  const quote = quoteResult(quotePayload);
  if (!summary && !quote) {
    return {
      ok: false,
      message: "Yahoo Finance did not return ETF metadata for this listing.",
      diagnostic: providerDiagnostic("unavailable", "etf_metadata_unavailable"),
    };
  }

  const fundProfile = object(summary?.fundProfile);
  const topHoldings = object(summary?.topHoldings);
  const summaryDetail = object(summary?.summaryDetail);
  const keyStatistics = object(summary?.defaultKeyStatistics);
  const fundPerformance = object(summary?.fundPerformance);
  const risk = object(summary?.risk);
  const fees = object(fundProfile?.feesExpensesInvestment);
  const equityHoldings = object(topHoldings?.equityHoldings);
  const holdings = (Array.isArray(topHoldings?.holdings) ? topHoldings.holdings : []).flatMap((entry) => {
    const holding = parseHolding(entry);
    return holding ? [holding] : [];
  });
  const concentration = holdingConcentration(holdings);
  const category = firstString(fundProfile?.categoryName, fundProfile?.category, quote?.category);
  const fundFamily = firstString(fundProfile?.family, quote?.fundFamily);
  const quoteType = firstString(quote?.quoteType);
  const classification = classifyUniversalSecurity({ company, quoteType, category });
  const expenseRatio = firstNumber(
    fees?.annualReportExpenseRatio,
    fees?.netExpRatio,
    summaryDetail?.expenseRatio,
    quote?.expenseRatio,
  );
  const assetsUnderManagement = firstNumber(summaryDetail?.totalAssets, quote?.totalAssets, keyStatistics?.totalAssets);
  const averageVolume = firstNumber(quote?.averageDailyVolume3Month, quote?.averageDailyVolume10Day, summaryDetail?.averageVolume);
  const price = firstNumber(quote?.regularMarketPrice);
  const averageDailyDollarVolume = averageVolume !== null && price !== null ? averageVolume * price : null;
  const inceptionTimestamp = firstNumber(fundProfile?.fundInceptionDate, keyStatistics?.fundInceptionDate, quote?.fundInceptionDate);
  const sharpeRatio3y = firstNumber(risk?.sharpeRatio3y, risk?.threeYearSharpeRatio, fundPerformance?.riskOverviewStatistics?.sharpeRatio3y);
  const volatility3y = firstNumber(risk?.standardDeviation3y, risk?.threeYearStandardDeviation);
  const weightedForwardPe = firstNumber(equityHoldings?.priceToEarnings, equityHoldings?.forwardPE);
  const weightedPriceBook = firstNumber(equityHoldings?.priceToBook);
  const distributionYield = firstNumber(summaryDetail?.yield, quote?.yield, summaryDetail?.trailingAnnualDividendYield);
  const numberOfHoldings = firstNumber(topHoldings?.holdingCount, topHoldings?.numberOfHoldings) ?? (holdings.length || null);

  const input: EtfAnalysisInput = {
    subtype: classification.kind === "operating_company" || classification.kind === "investment_company" || classification.kind === "bank" || classification.kind === "insurance" || classification.kind === "reit" || classification.kind === "real_estate" || classification.kind === "utility" || classification.kind === "commodity_mining" || classification.kind === "pre_profit_growth"
      ? "equity_etf"
      : classification.kind,
    expenseRatio,
    bidAskSpread: bidAskSpread(quote),
    assetsUnderManagement,
    averageDailyDollarVolume,
    fundAgeYears: inceptionAgeYears(inceptionTimestamp),
    numberOfHoldings,
    top10Weight: concentration.top10Weight,
    largestHoldingWeight: concentration.largestHoldingWeight,
    holdingsHhi: concentration.holdingsHhi,
    sectorHhi: parseSectorHhi(topHoldings),
    sharpeRatio3y,
    volatility3y,
    weightedForwardPe,
    weightedPriceBook,
    distributionYield,
    holdings,
  };

  const availableCount = Object.values(input).filter((value) => value !== null && value !== undefined && (!(Array.isArray(value)) || value.length > 0)).length;
  const status: ProviderDiagnostic["status"] = availableCount >= 7 ? "available" : "partial";
  return {
    ok: true,
    data: {
      input,
      category,
      fundFamily,
      quoteType,
      source: {
        name: "Yahoo Finance ETF metadata",
        url: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`,
        accessedAt: new Date().toISOString(),
        freshness: "Fund metadata, holdings and quote statistics are fetched live when Yahoo exposes them.",
        provider: PROVIDER_ID,
        capability: "specialized",
        dataAsOf: null,
        version: "yahoo-etf-v1",
      },
      diagnostic: providerDiagnostic(status, status === "partial" ? "partial_etf_metadata" : undefined),
    },
  };
}
