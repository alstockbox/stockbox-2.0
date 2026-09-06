import { classifyUniversalSecurity, type EtfAnalysisInput, type EtfHolding } from "@/lib/analysis/universal-security";
import type { AnalysisSource, CompanySearchResult, ProviderDiagnostic } from "@/lib/analysis/types";
import { summarizeEtfHoldingConcentration } from "./etf-holdings-math";
import { yahooSymbolForCompany } from "./yahoo-fundamentals";

const PROVIDER_ID = "yahoo-etf";
const REQUEST_TIMEOUT_MS = 10_000;
const YAHOO_HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"] as const;

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

function normalizeFraction(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.abs(value) > 1.5 ? value / 100 : value;
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

async function getYahooJson(path: string): Promise<JsonObject | null> {
  for (const host of YAHOO_HOSTS) {
    const payload = await getJson(`https://${host}${path}`);
    if (payload) return payload;
  }
  return null;
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
    const normalized = normalizeFraction(weight);
    return normalized !== null && normalized >= 0 ? [normalized] : [];
  });
  if (!weights.length) return null;
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return null;
  return weights.reduce((sum, value) => sum + (value / total) ** 2, 0);
}

function parseBondCreditWeights(topHoldings: JsonObject | null): {
  investmentGradeWeight: number | null;
  highYieldWeight: number | null;
} {
  const values = Array.isArray(topHoldings?.bondRatings) ? topHoldings.bondRatings : [];
  let investmentGradeWeight = 0;
  let highYieldWeight = 0;
  let investmentGradeSeen = false;
  let highYieldSeen = false;

  for (const entry of values) {
    const row = object(entry);
    if (!row) continue;
    for (const [rawKey, rawValue] of Object.entries(row)) {
      const value = normalizeFraction(numberValue(rawValue));
      if (value === null || value < 0) continue;
      const key = rawKey.toLowerCase().replace(/[^a-z0-9]+/g, "");
      if (/^(aaa|aa|a|bbb|investmentgrade)/.test(key)) {
        investmentGradeWeight += value;
        investmentGradeSeen = true;
      } else if (/^(bb|b|ccc|cc|c|belowinvestmentgrade|highyield)/.test(key)) {
        highYieldWeight += value;
        highYieldSeen = true;
      }
    }
  }

  return {
    investmentGradeWeight: investmentGradeSeen ? investmentGradeWeight : null,
    highYieldWeight: highYieldSeen ? highYieldWeight : null,
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

function explicitLeverageFactor(company: CompanySearchResult, category: string | null): number | null {
  const text = `${company.name} ${category ?? ""}`;
  const match = text.match(/(?:^|\s)(-?\d(?:\.\d+)?)\s*[x×](?:\s|$)/i)
    ?? text.match(/(?:^|\s)(-?\d(?:\.\d+)?)\s*times?(?:\s|$)/i);
  if (!match) return null;
  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) && Math.abs(parsed) > 1 ? parsed : null;
}

function explicitDailyReset(company: CompanySearchResult, category: string | null): boolean | null {
  const text = `${company.name} ${category ?? ""}`;
  return /\bdaily\b|daily[-\s]?reset|daily target/i.test(text) ? true : null;
}

export async function fetchYahooEtfData(company: CompanySearchResult): Promise<YahooEtfResult> {
  const symbol = yahooSymbolForCompany(company);
  const modules = ["fundProfile", "topHoldings", "summaryDetail", "defaultKeyStatistics", "fundPerformance", "risk"].join(",");
  const summaryPath = `/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${encodeURIComponent(modules)}`;
  const quotePath = `/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
  const [summaryPayload, quotePayload] = await Promise.all([getYahooJson(summaryPath), getYahooJson(quotePath)]);
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
  const riskOverviewStatistics = object(fundPerformance?.riskOverviewStatistics);
  const fees = object(fundProfile?.feesExpensesInvestment);
  const equityHoldings = object(topHoldings?.equityHoldings);
  const bondHoldings = object(topHoldings?.bondHoldings);
  const holdings = (Array.isArray(topHoldings?.holdings) ? topHoldings.holdings : []).flatMap((entry) => {
    const holding = parseHolding(entry);
    return holding ? [holding] : [];
  });
  const concentration = summarizeEtfHoldingConcentration(holdings);
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
  const sharpeRatio3y = firstNumber(risk?.sharpeRatio3y, risk?.threeYearSharpeRatio, riskOverviewStatistics?.sharpeRatio3y);
  const volatility3y = firstNumber(risk?.standardDeviation3y, risk?.threeYearStandardDeviation, riskOverviewStatistics?.standardDeviation3y);
  const maxDrawdown3y = firstNumber(risk?.maximumDrawdown3y, risk?.maxDrawdown3y, risk?.threeYearMaxDrawdown, fundPerformance?.maximumDrawdown3y);
  const trackingDifference = firstNumber(fundPerformance?.trackingDifference, risk?.trackingDifference, riskOverviewStatistics?.trackingDifference);
  const trackingError = firstNumber(fundPerformance?.trackingError3y, risk?.trackingError, risk?.threeYearTrackingError, riskOverviewStatistics?.trackingError3y);
  const weightedForwardPe = firstNumber(equityHoldings?.priceToEarnings, equityHoldings?.forwardPE);
  const weightedPriceBook = firstNumber(equityHoldings?.priceToBook);
  const distributionYield = firstNumber(summaryDetail?.yield, quote?.yield, summaryDetail?.trailingAnnualDividendYield);
  const turnover = firstNumber(fees?.annualHoldingsTurnover, fundProfile?.annualHoldingsTurnover, keyStatistics?.annualHoldingsTurnover);
  const numberOfHoldings = firstNumber(topHoldings?.holdingCount, topHoldings?.numberOfHoldings) ?? (holdings.length || null);
  const bondCredit = parseBondCreditWeights(topHoldings);
  const yieldToMaturity = firstNumber(bondHoldings?.yieldToMaturity, bondHoldings?.yieldToWorst, topHoldings?.yieldToMaturity);
  const effectiveDuration = firstNumber(bondHoldings?.effectiveDuration, bondHoldings?.duration, bondHoldings?.modifiedDuration, topHoldings?.effectiveDuration);
  const leverageFactor = classification.kind === "leveraged_inverse_etf" ? explicitLeverageFactor(company, category) : null;
  const dailyReset = classification.kind === "leveraged_inverse_etf" ? explicitDailyReset(company, category) : null;

  const input: EtfAnalysisInput = {
    subtype: classification.kind === "operating_company" || classification.kind === "investment_company" || classification.kind === "bank" || classification.kind === "insurance" || classification.kind === "reit" || classification.kind === "real_estate" || classification.kind === "utility" || classification.kind === "commodity_mining" || classification.kind === "pre_profit_growth"
      ? "equity_etf"
      : classification.kind,
    expenseRatio,
    trackingDifference,
    trackingError,
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
    maxDrawdown3y,
    weightedForwardPe,
    weightedPriceBook,
    distributionYield,
    turnover,
    yieldToMaturity,
    effectiveDuration,
    investmentGradeWeight: bondCredit.investmentGradeWeight,
    highYieldWeight: bondCredit.highYieldWeight,
    leverageFactor,
    dailyReset,
    holdings,
  };

  const availableCount = Object.values(input).filter((value) => value !== null && value !== undefined && (!(Array.isArray(value)) || value.length > 0)).length;
  const status: ProviderDiagnostic["status"] = availableCount >= 10 ? "available" : "partial";
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
        freshness: "Fund metadata, holdings, risk statistics, bond characteristics and quote statistics are fetched live when Yahoo exposes them. Holdings HHI is emitted only when parsed holdings represent at least 95% of the portfolio; partial top-holdings lists remain usable for top-weight concentration without pretending to be complete. StockBox tries both Yahoo query hosts before declaring the provider unavailable.",
        provider: PROVIDER_ID,
        capability: "specialized",
        dataAsOf: null,
        version: "yahoo-etf-v3",
      },
      diagnostic: providerDiagnostic(status, status === "partial" ? "partial_etf_metadata" : undefined),
    },
  };
}
