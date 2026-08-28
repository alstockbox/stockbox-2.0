import { classifyCompany } from "@/lib/analysis/archetypes";
import type {
  AnalysisArchetype,
  CompanyFundamentals,
  CompanySearchResult,
  FinancialPeriod,
  MetricProvenance,
  Sector,
} from "@/lib/analysis/types";
import { inferSecurityType } from "./security-classification";
import {
  providerDiagnostic,
  type AdapterResult,
  type CompanySearchProvider,
  type FundamentalsProvider,
  type ProviderCapabilities,
  type ProviderFailureReason,
} from "./providers";

const PROVIDER_ID = "yahoo-fundamentals";
const TIMESERIES_BASE = "https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries";
const SEARCH_BASE = "https://query1.finance.yahoo.com/v1/finance/search";

export const YAHOO_FUNDAMENTALS_CAPABILITIES: ProviderCapabilities = {
  supportedCountries: ["global"],
  supportedExchanges: ["Yahoo Finance global catalog"],
  supportsFundamentals: true,
  supportsMarketData: false,
  supportsEstimates: false,
};

type JsonObject = Record<string, unknown>;
type YahooValue = {
  asOfDate: string;
  periodType: string;
  currencyCode: string | null;
  value: number;
  concept: string;
};

type YahooMetadata = {
  sector: string | null;
  industry: string | null;
  name: string | null;
};

const FLOW_FIELDS = [
  "TotalRevenue", "CostOfRevenue", "GrossProfit", "TotalOperatingIncomeAsReported", "OperatingIncome", "EBITDA", "NetIncome",
  "NetIncomeCommonStockholders", "DilutedNIAvailtoComStockholders", "DilutedEPS",
  "OperatingCashFlow", "PurchaseOfPPE", "CapitalExpenditure", "InterestExpense", "PretaxIncome",
  "TaxProvision", "CashDividendsPaid", "StockBasedCompensation", "ResearchAndDevelopment",
  "DilutedAverageShares",
] as const;

const BALANCE_FIELDS = [
  "TotalAssets", "TotalLiabilitiesNetMinorityInterest", "StockholdersEquity", "MinorityInterest",
  "TotalEquityGrossMinorityInterest", "CashAndCashEquivalents", "TotalDebt", "CurrentAssets", "CurrentLiabilities",
  "OrdinarySharesNumber",
] as const;

const MONETARY_FLOW_FIELDS = FLOW_FIELDS.filter((field) => field !== "DilutedAverageShares");
const MONETARY_BALANCE_FIELDS = BALANCE_FIELDS.filter((field) => field !== "OrdinarySharesNumber");

const REQUEST_TYPES = [
  ...FLOW_FIELDS.flatMap((field) => [`annual${field}`, `trailing${field}`]),
  ...BALANCE_FIELDS.flatMap((field) => [`annual${field}`, `quarterly${field}`]),
  "trailingMarketCap",
];
function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function finiteNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number.NaN;
  return Number.isFinite(number) ? number : null;
}

function failure<T>(reason: ProviderFailureReason, message: string): AdapterResult<T> {
  return {
    ok: false,
    reason,
    message,
    diagnostic: providerDiagnostic("Yahoo Finance fundamentals", "fundamentals", "unavailable", reason),
  };
}

export function yahooSymbolForCompany(company: CompanySearchResult): string {
  const preferred = company.canonicalTicker
    ?? company.providerTickers?.find((ticker) => /\.[A-Z]{1,5}$/i.test(ticker))
    ?? company.ticker;
  const symbol = preferred.trim().toUpperCase();
  if ((company.country ?? "").toUpperCase() === "US" && symbol.includes(".")) return symbol.replaceAll(".", "-");
  return symbol;
}

function parseSeries(payload: JsonObject): YahooValue[] {
  const timeseries = object(payload.timeseries);
  const results = Array.isArray(timeseries?.result) ? timeseries.result : [];
  const values: YahooValue[] = [];
  for (const resultValue of results) {
    const result = object(resultValue);
    const meta = object(result?.meta);
    const type = Array.isArray(meta?.type) ? stringValue(meta?.type[0]) : null;
    if (!result || !type) continue;
    const rows = Array.isArray(result[type]) ? result[type] : [];
    for (const rowValue of rows) {
      const row = object(rowValue);
      const reported = object(row?.reportedValue);
      const value = finiteNumber(reported?.raw);
      const asOfDate = stringValue(row?.asOfDate);
      const periodType = stringValue(row?.periodType);
      if (value === null || !asOfDate || !periodType) continue;
      values.push({
        concept: type,
        asOfDate,
        periodType,
        currencyCode: stringValue(row?.currencyCode),
        value,
      });
    }
  }
  return values;
}
function latest(values: YahooValue[], concept: string, periodType?: string): YahooValue | null {
  return values
    .filter((item) => item.concept === concept && (!periodType || item.periodType === periodType))
    .sort((a, b) => a.asOfDate.localeCompare(b.asOfDate))
    .at(-1) ?? null;
}

function atDate(values: YahooValue[], concept: string, date: string): YahooValue | null {
  return values.find((item) => item.concept === concept && item.asOfDate === date) ?? null;
}

function semanticUnit(fact: YahooValue): string | undefined {
  if (/(?:AverageShares|SharesNumber|SharesOutstanding|ShareCount)$/i.test(fact.concept)) return "shares";
  return fact.currencyCode ?? undefined;
}

function provenance(fact: YahooValue): MetricProvenance {
  return {
    source: "Yahoo Finance fundamentals timeseries",
    provider: PROVIDER_ID,
    concept: fact.concept,
    unit: semanticUnit(fact),
    periodEnd: fact.asOfDate,
    periodBasis: fact.periodType === "TTM" ? "TTM_REPORTED" : fact.periodType === "12M" ? "FY" : undefined,
    valueKind: "reported",
  };
}

function normalizedCapex(fact: YahooValue | null): number | null {
  return fact ? Math.abs(fact.value) : null;
}

function fiscalYear(date: string): number | undefined {
  const year = Number(date.slice(0, 4));
  return Number.isInteger(year) ? year : undefined;
}

function periodCurrency(
  values: YahooValue[],
  flowPrefix: "annual" | "trailing",
  flowDate: string,
  balancePrefix: "annual" | "quarterly",
  balanceDate: string,
): { currency?: string; conflict?: string[] } {
  const flowConcepts = new Set(MONETARY_FLOW_FIELDS.map((field) => `${flowPrefix}${field}`));
  const balanceConcepts = new Set(MONETARY_BALANCE_FIELDS.map((field) => `${balancePrefix}${field}`));
  const currencies = [...new Set(values
    .filter((fact) => (
      (fact.asOfDate === flowDate && flowConcepts.has(fact.concept))
      || (fact.asOfDate === balanceDate && balanceConcepts.has(fact.concept))
    ))
    .map((fact) => fact.currencyCode?.trim().toUpperCase())
    .filter((currency): currency is string => Boolean(currency)))]
    .sort();
  if (currencies.length === 1) return { currency: currencies[0] };
  if (currencies.length > 1) return { conflict: currencies };
  return {};
}

function buildPeriod(
  values: YahooValue[],
  flowPrefix: "annual" | "trailing",
  flowDate: string,
  balancePrefix: "annual" | "quarterly",
  balanceDate: string,
): FinancialPeriod {
  const metricProvenance: Record<string, MetricProvenance> = {};
  const currency = periodCurrency(values, flowPrefix, flowDate, balancePrefix, balanceDate);
  const flow = (field: string, output: string = field) => {
    const fact = atDate(values, `${flowPrefix}${field}`, flowDate);
    if (!fact) return null;
    metricProvenance[output] = provenance(fact);
    return fact.value;
  };
  const balance = (field: string, output: string = field) => {
    const fact = atDate(values, `${balancePrefix}${field}`, balanceDate);
    if (!fact) return null;
    metricProvenance[output] = provenance(fact);
    return fact.value;
  };
  const capexFact = atDate(values, `${flowPrefix}PurchaseOfPPE`, flowDate) ?? atDate(values, `${flowPrefix}CapitalExpenditure`, flowDate);
  if (capexFact) metricProvenance.capitalExpenditures = provenance(capexFact);
  const dividendFact = atDate(values, `${flowPrefix}CashDividendsPaid`, flowDate);
  if (dividendFact) metricProvenance.dividendsPaid = provenance(dividendFact);
  const parentEquity = balance("StockholdersEquity", "totalEquity");
  const directMinorityInterest = balance("MinorityInterest", "minorityInterest");
  const grossEquityFact = atDate(values, `${balancePrefix}TotalEquityGrossMinorityInterest`, balanceDate);
  if (grossEquityFact) metricProvenance.totalEquity = provenance(grossEquityFact);
  const consolidatedEquity = grossEquityFact?.value ?? parentEquity;
  let minorityInterest = directMinorityInterest;
  if (minorityInterest === null && grossEquityFact && parentEquity !== null) {
    const derivedMinority = grossEquityFact.value - parentEquity;
    if (Number.isFinite(derivedMinority) && derivedMinority >= 0) {
      minorityInterest = derivedMinority;
      metricProvenance.minorityInterest = {
        source: "Yahoo Finance fundamentals timeseries",
        provider: PROVIDER_ID,
        unit: grossEquityFact.currencyCode ?? undefined,
        periodEnd: balanceDate,
        inputs: [grossEquityFact.concept, `${balancePrefix}StockholdersEquity`],
        valueKind: "derived",
        note: "Minority interest derived as gross equity including minority interest minus parent stockholders' equity.",
      };
    }
  }

  return {
    fiscalYear: fiscalYear(flowDate),
    periodEndDate: flowDate,
    form: flowPrefix === "trailing" ? "TTM" : "FY",
    periodBasis: flowPrefix === "trailing" ? "TTM_REPORTED" : "FY",
    balanceSheetDate: balanceDate,
    currency: currency.currency,
    currencyConflict: currency.conflict,
    revenue: flow("TotalRevenue", "revenue"),
    costOfRevenue: flow("CostOfRevenue", "costOfRevenue"),
    grossProfit: flow("GrossProfit", "grossProfit"),
    operatingIncome: flow("TotalOperatingIncomeAsReported", "operatingIncome") ?? flow("OperatingIncome", "operatingIncome"),
    ebitda: flow("EBITDA", "ebitda"),
    netIncome: flow("NetIncomeIncludingNoncontrollingInterests", "netIncome") ?? flow("NetIncome", "netIncome"),
    netIncomeCommonStockholders: flow("NetIncomeCommonStockholders", "netIncomeCommonStockholders"),
    dilutedNetIncomeAvailableToCommon: flow("DilutedNIAvailtoComStockholders", "dilutedNetIncomeAvailableToCommon"),
    epsDiluted: flow("DilutedEPS", "epsDiluted"),
    operatingCashFlow: flow("OperatingCashFlow", "operatingCashFlow"),
    capitalExpenditures: normalizedCapex(capexFact),
    interestExpense: flow("InterestExpense", "interestExpense"),
    pretaxIncome: flow("PretaxIncome", "pretaxIncome"),
    incomeTaxExpense: flow("TaxProvision", "incomeTaxExpense"),
    dividendsPaid: dividendFact ? Math.abs(dividendFact.value) : null,
    stockBasedCompensation: flow("StockBasedCompensation", "stockBasedCompensation"),
    researchAndDevelopment: flow("ResearchAndDevelopment", "researchAndDevelopment"),
    sharesDiluted: flow("DilutedAverageShares", "sharesDiluted"),
    totalAssets: balance("TotalAssets", "totalAssets"),
    totalLiabilities: balance("TotalLiabilitiesNetMinorityInterest", "totalLiabilities"),
    totalEquity: consolidatedEquity,
    minorityInterest,
    cashAndEquivalents: balance("CashAndCashEquivalents", "cashAndEquivalents"),
    totalDebt: balance("TotalDebt", "totalDebt"),
    currentAssets: balance("CurrentAssets", "currentAssets"),
    currentLiabilities: balance("CurrentLiabilities", "currentLiabilities"),
    currentSharesOutstanding: balance("OrdinarySharesNumber", "currentSharesOutstanding"),
    provenance: metricProvenance,
  };
}

function annualDates(values: YahooValue[]): string[] {
  const anchors = new Set(["annualTotalRevenue", "annualNetIncome", "annualTotalAssets"]);
  return [...new Set(values
    .filter((item) => anchors.has(item.concept) && item.periodType === "12M")
    .map((item) => item.asOfDate))]
    .sort()
    .slice(-6);
}

function latestAtOrBefore(values: YahooValue[], concepts: string[], date: string): YahooValue | null {
  return values
    .filter((item) => concepts.includes(item.concept) && item.asOfDate <= date)
    .sort((a, b) => a.asOfDate.localeCompare(b.asOfDate))
    .at(-1) ?? null;
}

function trailingDate(values: YahooValue[]): string | null {
  for (const concept of ["trailingTotalRevenue", "trailingNetIncome", "trailingOperatingCashFlow"]) {
    const fact = latest(values, concept, "TTM");
    if (fact) return fact.asOfDate;
  }
  return null;
}

function balanceDateFor(values: YahooValue[], flowDate: string): string | null {
  return latestAtOrBefore(values, ["quarterlyTotalAssets", "quarterlyStockholdersEquity", "quarterlyCashAndCashEquivalents"], flowDate)?.asOfDate
    ?? latestAtOrBefore(values, ["annualTotalAssets", "annualStockholdersEquity", "annualCashAndCashEquivalents"], flowDate)?.asOfDate
    ?? null;
}
function classifyYahooMetadata(metadata: YahooMetadata) {
  const description = [metadata.industry, metadata.sector].filter(Boolean).join(" ");
  const classified = classifyCompany({ sicDescription: description, name: metadata.name });
  const confidentUnsupportedSpecialist = classified.analysisArchetype === "unknown"
    && !classified.classificationDiagnostics.ambiguous
    && classified.classificationDiagnostics.confidence >= 0.6;
  if (classified.analysisArchetype !== "unknown" || confidentUnsupportedSpecialist) return classified;

  const sector = (metadata.sector ?? "").toLowerCase();
  const fallback = (
    resolvedSector: Sector,
    analysisArchetype: AnalysisArchetype,
  ) => ({
    sector: resolvedSector,
    industry: metadata.industry,
    analysisArchetype,
    classificationDiagnostics: {
      reason: `Yahoo sector metadata (${metadata.sector ?? "unavailable"}) supplied the fallback classification.`,
      source: "fallback" as const,
      confidence: analysisArchetype === "unknown" ? 0.3 : 0.55,
      ambiguous: analysisArchetype === "unknown",
      candidates: [analysisArchetype],
    },
  });
  if (/technology/.test(sector)) return fallback("technology", "standard");
  if (/industrial/.test(sector)) return fallback("industrials", "standard");
  if (/consumer/.test(sector)) return fallback("consumer", "standard");
  if (/health/.test(sector)) return fallback("healthcare", "standard");
  if (/energy/.test(sector)) return fallback("energy", "cyclical");
  if (/basic materials|materials/.test(sector)) return fallback("materials", "cyclical");
  if (/utilities/.test(sector)) return fallback("utilities", "utility");
  if (/communication/.test(sector)) return fallback("communication", "standard");
  if (/real estate/.test(sector)) return fallback("realEstate", "unknown");
  if (/financial/.test(sector)) return fallback("financials", "unknown");
  return classified;
}
async function fetchJson(url: URL): Promise<AdapterResult<JsonObject>> {
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json", "user-agent": "Mozilla/5.0 StockBox/1.0" },
      next: { revalidate: 60 * 30 },
    });
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType.includes("text/html")) return failure("html_response", "Yahoo Finance returned HTML instead of fundamentals data.");
    if (!response.ok) {
      const reason: ProviderFailureReason = response.status === 429 ? "rate_limited" : response.status === 404 ? "not_found" : "upstream_error";
      return failure(reason, `Yahoo Finance fundamentals request failed with HTTP ${response.status}.`);
    }
    if (!contentType.includes("json")) return failure("unexpected_content_type", "Yahoo Finance returned an unexpected fundamentals content type.");
    const payload = object(await response.json());
    if (!payload) return failure("empty_response", "Yahoo Finance returned an empty fundamentals response.");
    return { ok: true, data: payload, diagnostic: providerDiagnostic("Yahoo Finance fundamentals", "fundamentals", "available") };
  } catch {
    return failure("upstream_error", "Yahoo Finance fundamentals could not be reached or parsed.");
  }
}

async function fetchMetadata(symbol: string): Promise<YahooMetadata> {
  const url = new URL(SEARCH_BASE);
  url.searchParams.set("q", symbol);
  url.searchParams.set("quotesCount", "5");
  url.searchParams.set("newsCount", "0");  const response = await fetchJson(url);
  if (!response.ok) return { sector: null, industry: null, name: null };
  const quotes = Array.isArray(response.data.quotes) ? response.data.quotes : [];
  const quote = quotes.map(object).find((item) => stringValue(item?.symbol)?.toUpperCase() === symbol.toUpperCase()) ?? null;
  return {
    sector: stringValue(quote?.sector),
    industry: stringValue(quote?.industry),
    name: stringValue(quote?.longname) ?? stringValue(quote?.shortname),
  };
}

function isDepositaryReceiptName(name: string): boolean {
  return /\badr\b|american depositary|depositary receipt/i.test(name);
}

function isPreferredSecurityName(name: string): boolean {
  return /preferred|preference|depositary shares/i.test(name);
}

function yahooSecurityType(quoteType: string | null, name: string): CompanySearchResult["securityType"] {
  if (quoteType === "ETF" || quoteType === "MUTUALFUND") return "ETF/Fund";
  if (isDepositaryReceiptName(name)) return "ADR";
  if (isPreferredSecurityName(name)) return "Preferred";
  return "Common Stock";
}

export const yahooCompanySearchProvider: CompanySearchProvider = {
  id: "yahoo-search",
  capabilities: { ...YAHOO_FUNDAMENTALS_CAPABILITIES, supportsMarketData: true },
  async search(query) {
    const url = new URL(SEARCH_BASE);
    url.searchParams.set("q", query);
    url.searchParams.set("quotesCount", "20");
    url.searchParams.set("newsCount", "0");
    const response = await fetchJson(url);
    if (!response.ok) return {
      ...response,
      diagnostic: providerDiagnostic("Yahoo Finance search", "search", "unavailable", response.reason),
    };
    const quotes = Array.isArray(response.data.quotes) ? response.data.quotes.map(object).filter(Boolean) : [];
    const data = quotes.flatMap((quote) => {
      const symbol = stringValue(quote?.symbol)?.toUpperCase();
      const name = stringValue(quote?.longname) ?? stringValue(quote?.shortname);
      const quoteType = stringValue(quote?.quoteType)?.toUpperCase() ?? null;
      if (!symbol || !name || !["EQUITY", "ETF", "MUTUALFUND"].includes(quoteType ?? "")) return [];
      const securityType = inferSecurityType({
        ticker: symbol,
        canonicalTicker: symbol,
        name,
        securityType: yahooSecurityType(quoteType, name),
      });
      return [{
        ticker: symbol,
        canonicalTicker: symbol,
        name,
        exchange: stringValue(quote?.exchDisp) ?? stringValue(quote?.exchange) ?? undefined,
        country: stringValue(quote?.country) ?? undefined,
        currency: stringValue(quote?.currency) ?? undefined,
        securityType,
        providerTickers: [symbol],
        providerCapabilities: { fundamentals: quoteType === "EQUITY" && securityType === "Common Stock", marketData: true, providerIds: ["yahoo-search", PROVIDER_ID] },
      } satisfies CompanySearchResult];
    });
    return { ok: true, data, diagnostic: providerDiagnostic("Yahoo Finance search", "search", data.length ? "available" : "partial", data.length ? undefined : "empty_response") };
  },
};

function stableYahooPeriod2(now = Date.now()): string {
  const date = new Date(now);
  return String(Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1) / 1000));
}

async function fetchTimeseries(symbol: string): Promise<AdapterResult<YahooValue[]>> {
  const url = new URL(`${TIMESERIES_BASE}/${encodeURIComponent(symbol)}`);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("type", REQUEST_TYPES.join(","));
  url.searchParams.set("period1", "1262304000");
  url.searchParams.set("period2", stableYahooPeriod2());
  const response = await fetchJson(url);
  if (!response.ok) return response;
  const values = parseSeries(response.data);
  if (!values.length) return failure("empty_response", "Yahoo Finance returned no usable fundamentals facts for this security.");
  return {
    ok: true,
    data: values,
    diagnostic: providerDiagnostic("Yahoo Finance fundamentals", "fundamentals", "available"),
  };
}
function toLegacy(period: FinancialPeriod): CompanyFundamentals["annual"][number] {
  return {
    fiscalYear: period.fiscalYear ?? Number(period.periodEndDate?.slice(0, 4)),
    periodEndDate: period.periodEndDate,
    revenue: period.revenue ?? null,
    grossProfit: period.grossProfit ?? null,
    costOfRevenue: period.costOfRevenue ?? null,
    operatingIncome: period.operatingIncome ?? null,
    ebitda: period.ebitda ?? null,
    netIncome: period.netIncome ?? null,
    netIncomeCommonStockholders: period.netIncomeCommonStockholders ?? null,
    dilutedNetIncomeAvailableToCommon: period.dilutedNetIncomeAvailableToCommon ?? null,
    pretaxIncome: period.pretaxIncome ?? null,
    incomeTaxExpense: period.incomeTaxExpense ?? null,
    epsDiluted: period.epsDiluted ?? null,
    operatingCashFlow: period.operatingCashFlow ?? null,
    capex: period.capitalExpenditures ?? null,
    assets: period.totalAssets ?? null,
    liabilities: period.totalLiabilities ?? null,
    cash: period.cashAndEquivalents ?? null,
    debt: period.totalDebt ?? null,
    equity: period.totalEquity ?? null,
    minorityInterest: period.minorityInterest ?? null,
    currentAssets: period.currentAssets ?? null,
    currentLiabilities: period.currentLiabilities ?? null,
    interestExpense: period.interestExpense ?? null,
    dividendsPaid: period.dividendsPaid ?? null,
    stockBasedCompensation: period.stockBasedCompensation ?? null,
    researchAndDevelopment: period.researchAndDevelopment ?? null,
    sharesDiluted: period.sharesDiluted ?? null,
    currentSharesOutstanding: period.currentSharesOutstanding ?? null,
    provenance: period.provenance,
  };
}
export async function fetchYahooFundamentalsResult(
  company: CompanySearchResult,
): Promise<AdapterResult<CompanyFundamentals>> {
  const symbol = yahooSymbolForCompany(company);
  const [seriesResult, metadata] = await Promise.all([
    fetchTimeseries(symbol),
    fetchMetadata(symbol),
  ]);
  if (!seriesResult.ok) return seriesResult;

  const values = seriesResult.data;
  const dates = annualDates(values);
  const annualPeriods = dates.map((date) => buildPeriod(values, "annual", date, "annual", date));
  const currentTrailingDate = trailingDate(values);
  const balanceDate = currentTrailingDate ? balanceDateFor(values, currentTrailingDate) : null;
  const balancePrefix = balanceDate && values.some((item) => item.asOfDate === balanceDate && item.concept.startsWith("quarterly"))
    ? "quarterly" as const
    : "annual" as const;
  const trailingTwelveMonths = currentTrailingDate && balanceDate
    ? buildPeriod(values, "trailing", currentTrailingDate, balancePrefix, balanceDate)
    : undefined;
  const classification = classifyYahooMetadata(metadata);
  const marketCapFact = latest(values, "trailingMarketCap", "TTM");
  const sharesFact = latest(values, "quarterlyOrdinarySharesNumber", "3M")
    ?? latest(values, "annualOrdinarySharesNumber", "12M");
  const latestAnnualPeriodEnd = annualPeriods.at(-1)?.periodEndDate ?? null;
  const diagnostic = providerDiagnostic(
    "Yahoo Finance fundamentals",
    "fundamentals",
    trailingTwelveMonths || annualPeriods.length >= 2 ? "available" : "partial",
    trailingTwelveMonths ? undefined : "ttm_unavailable_annual_fallback",
  );
  return {
    ok: true,
    data: {
      ticker: company.ticker,
      name: metadata.name ?? company.name,
      entityId: company.entityId ?? company.issuerId,
      sector: classification.sector,
      industry: classification.industry,
      analysisArchetype: classification.analysisArchetype,
      classificationDiagnostics: classification.classificationDiagnostics,
      annual: annualPeriods.map(toLegacy),
      annualPeriods,
      trailingTwelveMonths,
      reportedMarketCap: marketCapFact?.value ?? null,
      reportedMarketCapDate: marketCapFact?.asOfDate ?? null,
      reportedMarketCapCurrency: marketCapFact?.currencyCode ?? null,
      reportedSharesOutstanding: sharesFact?.value ?? null,
      reportedSharesDate: sharesFact?.asOfDate ?? null,
      diagnostics: {
        latestFinancialPeriodEnd: trailingTwelveMonths?.periodEndDate ?? latestAnnualPeriodEnd,
        latestAnnualPeriodEnd,
        dataAgeDays: null,
        ttmStatus: trailingTwelveMonths ? "available" : annualPeriods.length ? "annual_fallback" : "unavailable",
        providerDiagnostics: [diagnostic],
        financialFlowPeriodEnd: trailingTwelveMonths?.periodEndDate ?? latestAnnualPeriodEnd,
        financialFlowPeriodBasis: trailingTwelveMonths?.periodBasis ?? (latestAnnualPeriodEnd ? "FY" : null),
        balanceSheetPeriodEnd: trailingTwelveMonths?.balanceSheetDate ?? latestAnnualPeriodEnd,
        dataStatus: annualPeriods.length ? "current" : "unavailable",
      },
    },
    diagnostic,
  };
}

export const yahooFundamentalsProvider: FundamentalsProvider = {
  id: PROVIDER_ID,
  capabilities: YAHOO_FUNDAMENTALS_CAPABILITIES,
  fetchFundamentals: fetchYahooFundamentalsResult,
};
