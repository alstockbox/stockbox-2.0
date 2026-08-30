import { classifyCompany } from "@/lib/analysis/archetypes";
import type {
  AnalysisArchetype,
  CompanyFundamentals,
  CompanySearchResult,
  FinancialPeriod,
  MetricProvenance,
  Sector,
  SpecializedCompanyData,
  SpecializedMetric,
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
const CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";
const YAHOO_REQUEST_TIMEOUT_MS = 10_000;

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

type FlowMetricFact = {
  asOfDate: string;
  periodType: string;
  currencyCode: string | null;
  value: number;
  concept: string;
  provenance: MetricProvenance;
};

type YahooMetadata = {
  sector: string | null;
  industry: string | null;
  name: string | null;
};

const FLOW_FIELDS = [
  "TotalRevenue", "CostOfRevenue", "GrossProfit", "TotalOperatingIncomeAsReported", "OperatingIncome", "EBITDA", "NetIncome",
  "NetIncomeCommonStockholders", "DilutedNIAvailtoComStockholders", "DilutedEPS",
  "OperatingCashFlow", "FreeCashFlow", "PurchaseOfPPE", "CapitalExpenditure", "InterestExpense", "PretaxIncome",
  "TaxProvision", "CashDividendsPaid", "StockBasedCompensation", "ResearchAndDevelopment",
  "DilutedAverageShares",
] as const;

const BALANCE_FIELDS = [
  "TotalAssets", "TotalLiabilitiesNetMinorityInterest", "StockholdersEquity", "MinorityInterest",
  "TotalEquityGrossMinorityInterest", "CashAndCashEquivalents", "TotalDebt",
  "LongTermDebtAndCapitalLeaseObligation", "CurrentDebtAndCapitalLeaseObligation",
  "CurrentAssets", "CurrentLiabilities", "OrdinarySharesNumber",
] as const;

const BANK_FLOW_FIELDS = ["NetInterestIncome", "CreditLossesProvision", "NonInterestIncome", "NonInterestExpense"] as const;
const BANK_LOAN_BALANCE_FIELDS = ["LoansReceivable", "NetLoan"] as const;
const BANK_BALANCE_FIELDS = [...BANK_LOAN_BALANCE_FIELDS, "TotalDeposits", "TangibleBookValue", "CommonStockEquity"] as const;
const INSURER_PREMIUM_FIELDS = [
  "PremiumRevenue", "NetPremiumsEarned", "PremiumsEarned",
  "EarnedPremiums", "NetEarnedPremiums", "NetPremiumsWritten", "GrossPremiumsWritten",
] as const;
const INSURER_LOSS_FIELDS = ["LossAdjustmentExpense", "NetPolicyholderBenefitsAndClaims"] as const;
const INSURER_EXPENSE_FIELDS = ["UnderwritingExpense", "InsuranceUnderwritingExpense"] as const;
const INSURER_FLOW_FIELDS = [...INSURER_PREMIUM_FIELDS, ...INSURER_LOSS_FIELDS, ...INSURER_EXPENSE_FIELDS] as const;
const INSURER_BOOK_FIELDS = ["CommonStockEquity", "StockholdersEquity"] as const;

const MONETARY_FLOW_FIELDS = FLOW_FIELDS.filter((field) => field !== "DilutedAverageShares");
const MONETARY_BALANCE_FIELDS = BALANCE_FIELDS.filter((field) => field !== "OrdinarySharesNumber");

const REQUEST_TYPES = [
  ...FLOW_FIELDS.flatMap((field) => [`annual${field}`, `trailing${field}`]),
  ...BALANCE_FIELDS.flatMap((field) => [`annual${field}`, `quarterly${field}`]),
  ...BANK_FLOW_FIELDS.flatMap((field) => [`annual${field}`, `trailing${field}`, `quarterly${field}`]),
  ...BANK_BALANCE_FIELDS.flatMap((field) => [`annual${field}`, `quarterly${field}`]),
  ...INSURER_FLOW_FIELDS.flatMap((field) => [`annual${field}`, `trailing${field}`]),
  "trailingMarketCap",
  "trailingEnterpriseValue",
  "trailingPeRatio",
  "trailingPsRatio",
  "trailingPbRatio",
  "trailingPegRatio",
  "trailingEnterprisesValueRevenueRatio",
  "trailingEnterprisesValueEBITDARatio",
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

function unavailableSpecializedMetric(definition: string): SpecializedMetric {
  return { value: null, dataAsOf: null, definition };
}

function yahooSpecializedMetric(fact: YahooValue | null | undefined, definition: string): SpecializedMetric {
  return fact ? {
    value: fact.value,
    unit: semanticUnit(fact),
    dataAsOf: fact.asOfDate,
    provenance: provenance(fact),
    definition,
  } : unavailableSpecializedMetric(definition);
}

function derivedSpecializedMetric(
  value: number | null,
  dataAsOf: string | null,
  definition: string,
  inputs: string[],
  note: string,
): SpecializedMetric {
  if (!Number.isFinite(value) || !dataAsOf) return unavailableSpecializedMetric(definition);
  return {
    value,
    unit: "ratio",
    dataAsOf,
    definition,
    provenance: {
      source: "Yahoo Finance fundamentals timeseries",
      provider: PROVIDER_ID,
      periodEnd: dataAsOf,
      inputs,
      valueKind: "derived",
      note,
    },
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
  const consolidatedEquity = parentEquity ?? grossEquityFact?.value ?? null;
  if (parentEquity === null && grossEquityFact) metricProvenance.totalEquity = provenance(grossEquityFact);
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
  let totalDebt = balance("TotalDebt", "totalDebt");
  if (totalDebt === null) {
    const longTermDebt = atDate(values, `${balancePrefix}LongTermDebtAndCapitalLeaseObligation`, balanceDate);
    const currentDebt = atDate(values, `${balancePrefix}CurrentDebtAndCapitalLeaseObligation`, balanceDate);
    const debtCurrency = longTermDebt?.currencyCode?.trim().toUpperCase();
    const currentDebtCurrency = currentDebt?.currencyCode?.trim().toUpperCase();
    if (longTermDebt && currentDebt && debtCurrency && debtCurrency === currentDebtCurrency) {
      const derivedDebt = longTermDebt.value + currentDebt.value;
      if (Number.isFinite(derivedDebt) && derivedDebt >= 0) {
        totalDebt = derivedDebt;
        metricProvenance.totalDebt = {
          source: "Yahoo Finance fundamentals timeseries",
          provider: PROVIDER_ID,
          unit: debtCurrency,
          periodEnd: balanceDate,
          inputs: [longTermDebt.concept, currentDebt.concept],
          valueKind: "derived",
          note: "Total debt derived as same-date long-term plus current debt including capital lease obligations because Yahoo TotalDebt was unavailable.",
        };
      }
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
    freeCashFlow: flow("FreeCashFlow", "freeCashFlow"),
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
    totalDebt,
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

function latestFlow(values: YahooValue[], field: string): YahooValue | null {
  return latest(values, `trailing${field}`, "TTM") ?? latest(values, `annual${field}`, "12M");
}

function flowMetricFact(fact: YahooValue, absoluteValue = false): FlowMetricFact {
  const baseProvenance = provenance(fact);
  if (!absoluteValue) {
    return { ...fact, provenance: baseProvenance };
  }
  return {
    ...fact,
    value: Math.abs(fact.value),
    provenance: {
      source: baseProvenance.source,
      provider: baseProvenance.provider,
      unit: baseProvenance.unit,
      periodEnd: baseProvenance.periodEnd,
      periodBasis: baseProvenance.periodBasis,
      inputs: [fact.concept],
      valueKind: "derived",
      note: "Normalized to absolute value because Yahoo may report bank provisions or expenses with a negative sign.",
    },
  };
}

function quarterlyFlowFacts(values: YahooValue[], field: string): YahooValue[] {
  return values
    .filter((item) => item.concept === `quarterly${field}` && item.periodType === "3M")
    .sort((a, b) => a.asOfDate.localeCompare(b.asOfDate));
}

function hasQuarterlyCadence(facts: YahooValue[]): boolean {
  for (let index = 1; index < facts.length; index += 1) {
    const gapDays = (Date.parse(facts[index].asOfDate) - Date.parse(facts[index - 1].asOfDate)) / 86_400_000;
    if (!Number.isFinite(gapDays) || gapDays < 70 || gapDays > 115) return false;
  }
  return true;
}

function latestFourQuarterFlowFact(values: YahooValue[], field: string, absoluteValue = false): FlowMetricFact | null {
  const facts = quarterlyFlowFacts(values, field).slice(-4);
  if (facts.length < 4 || !hasQuarterlyCadence(facts)) return null;
  const currency = sameMonetaryCurrency(facts);
  if (!currency) return null;
  const latestFact = facts[facts.length - 1];
  const value = facts.reduce((sum, fact) => sum + (absoluteValue ? Math.abs(fact.value) : fact.value), 0);
  return {
    asOfDate: latestFact.asOfDate,
    periodType: "TTM_FROM_QUARTERS",
    currencyCode: currency,
    value,
    concept: `quarterly${field}`,
    provenance: {
      source: "Yahoo Finance fundamentals timeseries",
      provider: PROVIDER_ID,
      unit: currency,
      periodEnd: latestFact.asOfDate,
      inputs: facts.map((fact) => `${fact.concept}@${fact.asOfDate}`),
      valueKind: "derived",
      note: `Derived as the sum of the latest four same-currency quarterly ${field} facts.`,
    },
  };
}

function latestFlowMetricFact(values: YahooValue[], field: string, absoluteValue = false): FlowMetricFact | null {
  const reported = latestFlow(values, field);
  if (reported) return flowMetricFact(reported, absoluteValue);
  return latestFourQuarterFlowFact(values, field, absoluteValue);
}

function specializedMetricFromFlowFact(fact: FlowMetricFact | null, definition: string): SpecializedMetric {
  return fact ? {
    value: fact.value,
    unit: fact.provenance.unit,
    dataAsOf: fact.asOfDate,
    provenance: fact.provenance,
    definition,
  } : unavailableSpecializedMetric(definition);
}

function flowFactsFrom(values: YahooValue[], fields: readonly string[]): YahooValue[] {
  const concepts = new Set(fields.flatMap((field) => [`trailing${field}`, `annual${field}`]));
  return values
    .filter((item) => concepts.has(item.concept) && (item.periodType === "TTM" || item.periodType === "12M"))
    .sort((a, b) =>
      b.asOfDate.localeCompare(a.asOfDate)
      || (b.periodType === "TTM" ? 1 : 0) - (a.periodType === "TTM" ? 1 : 0)
    );
}

function latestSamePeriodFlowPair(
  values: YahooValue[],
  numeratorFields: readonly string[],
  denominatorFields: readonly string[],
): [YahooValue, YahooValue] | null {
  const denominators = flowFactsFrom(values, denominatorFields);
  for (const numerator of flowFactsFrom(values, numeratorFields)) {
    const denominator = denominators.find((candidate) =>
      candidate.asOfDate === numerator.asOfDate
      && candidate.periodType === numerator.periodType
      && sameMonetaryCurrency([numerator, candidate])
    );
    if (denominator) return [numerator, denominator];
  }
  return null;
}

function latestSamePeriodFlowTriple(
  values: YahooValue[],
  firstFields: readonly string[],
  secondFields: readonly string[],
  thirdFields: readonly string[],
): [YahooValue, YahooValue, YahooValue] | null {
  const seconds = flowFactsFrom(values, secondFields);
  const thirds = flowFactsFrom(values, thirdFields);
  for (const first of flowFactsFrom(values, firstFields)) {
    const second = seconds.find((candidate) =>
      candidate.asOfDate === first.asOfDate
      && candidate.periodType === first.periodType
      && sameMonetaryCurrency([first, candidate])
    );
    const third = thirds.find((candidate) =>
      candidate.asOfDate === first.asOfDate
      && candidate.periodType === first.periodType
      && sameMonetaryCurrency([first, candidate])
    );
    if (second && third && sameMonetaryCurrency([first, second, third])) return [first, second, third];
  }
  return null;
}

function latestBalance(values: YahooValue[], field: string): YahooValue | null {
  return latest(values, `quarterly${field}`, "3M") ?? latest(values, `annual${field}`, "12M");
}

function latestBalanceFrom(values: YahooValue[], fields: readonly string[]): YahooValue | null {
  for (const field of fields) {
    const fact = latestBalance(values, field);
    if (fact) return fact;
  }
  return null;
}

function annualFacts(values: YahooValue[], field: string): YahooValue[] {
  return values
    .filter((item) => item.concept === `annual${field}` && item.periodType === "12M")
    .sort((a, b) => a.asOfDate.localeCompare(b.asOfDate));
}

function latestAnnualPair(values: YahooValue[], field: string): [YahooValue, YahooValue] | null {
  const facts = annualFacts(values, field);
  if (facts.length < 2) return null;
  return [facts[facts.length - 2], facts[facts.length - 1]];
}

function annualPairEndingAt(values: YahooValue[], field: string, date: string): [YahooValue, YahooValue] | null {
  const facts = annualFacts(values, field).filter((item) => item.asOfDate <= date);
  const currentIndex = facts.findIndex((item) => item.asOfDate === date);
  if (currentIndex <= 0) return null;
  return [facts[currentIndex - 1], facts[currentIndex]];
}

function sameMonetaryCurrency(facts: YahooValue[]): string | null {
  const currencies = [...new Set(facts.map((fact) => fact.currencyCode?.trim().toUpperCase()).filter((currency): currency is string => Boolean(currency)))];
  return currencies.length === 1 ? currencies[0] : null;
}

function growthSpecializedMetric(values: YahooValue[], field: string, definition: string): SpecializedMetric {
  const pair = latestAnnualPair(values, field);
  if (!pair) return unavailableSpecializedMetric(definition);
  const [prior, current] = pair;
  if (prior.value <= 0) return unavailableSpecializedMetric(definition);
  const monetary = !/Shares/i.test(field);
  if (monetary && !sameMonetaryCurrency([prior, current])) return unavailableSpecializedMetric(definition);
  return derivedSpecializedMetric(
    current.value / prior.value - 1,
    current.asOfDate,
    definition,
    [prior.concept, current.concept],
    `Derived as latest reported annual ${field} divided by the prior comparable annual value minus one.`,
  );
}

function growthSpecializedMetricFrom(values: YahooValue[], fields: readonly string[], definition: string): SpecializedMetric {
  for (const field of fields) {
    const metric = growthSpecializedMetric(values, field, definition);
    if (typeof metric.value === "number" && Number.isFinite(metric.value)) return metric;
  }
  return unavailableSpecializedMetric(definition);
}

function samePeriodRatioSpecializedMetricFrom(
  values: YahooValue[],
  numeratorFields: readonly string[],
  denominatorFields: readonly string[],
  definition: string,
  note: string,
): SpecializedMetric {
  const pair = latestSamePeriodFlowPair(values, numeratorFields, denominatorFields);
  if (!pair) return unavailableSpecializedMetric(definition);
  const [numerator, denominator] = pair;
  if (denominator.value <= 0) return unavailableSpecializedMetric(definition);
  return derivedSpecializedMetric(
    Math.abs(numerator.value) / denominator.value,
    numerator.asOfDate,
    definition,
    [numerator.concept, denominator.concept],
    note,
  );
}

function combinedRatioSpecializedMetric(
  values: YahooValue[],
): SpecializedMetric {
  const definition = "Combined ratio from reported loss-adjustment and underwriting expenses divided by reported premiums.";
  const triple = latestSamePeriodFlowTriple(values, INSURER_LOSS_FIELDS, INSURER_EXPENSE_FIELDS, INSURER_PREMIUM_FIELDS);
  if (!triple) return unavailableSpecializedMetric(definition);
  const [losses, expenses, premiums] = triple;
  if (premiums.value <= 0) return unavailableSpecializedMetric(definition);
  return derivedSpecializedMetric(
    (Math.abs(losses.value) + Math.abs(expenses.value)) / premiums.value,
    losses.asOfDate,
    definition,
    [losses.concept, expenses.concept, premiums.concept],
    "Derived only from same-period Yahoo insurer premium, loss and underwriting-expense facts.",
  );
}

function returnOnAverageAnnualBalance(
  values: YahooValue[],
  balanceField: string,
  definition: string,
): SpecializedMetric {
  const netIncome = latest(values, "annualNetIncome", "12M");
  if (!netIncome) return unavailableSpecializedMetric(definition);
  const balancePair = annualPairEndingAt(values, balanceField, netIncome.asOfDate);
  if (!balancePair) return unavailableSpecializedMetric(definition);
  const [priorBalance, currentBalance] = balancePair;
  if (!sameMonetaryCurrency([netIncome, priorBalance, currentBalance])) return unavailableSpecializedMetric(definition);
  const averageBalance = (priorBalance.value + currentBalance.value) / 2;
  const value = averageBalance > 0 ? netIncome.value / averageBalance : null;
  return derivedSpecializedMetric(
    value,
    netIncome.asOfDate,
    definition,
    [netIncome.concept, priorBalance.concept, currentBalance.concept],
    `Derived from annual net income divided by average reported ${balanceField}.`,
  );
}

function tangibleBookValuePerShare(values: YahooValue[]): SpecializedMetric {
  const tangibleBook = latestBalance(values, "TangibleBookValue");
  if (!tangibleBook) return unavailableSpecializedMetric("Tangible book value per share requires reported tangible common equity and share count.");
  const shares = latestAtOrBefore(values, ["quarterlyOrdinarySharesNumber", "annualOrdinarySharesNumber"], tangibleBook.asOfDate);
  const value = shares && shares.asOfDate === tangibleBook.asOfDate && shares.value > 0
    ? tangibleBook.value / shares.value
    : null;
  return derivedSpecializedMetric(
    value,
    tangibleBook.asOfDate,
    "Tangible book value per share derived from same-date tangible common equity and ordinary shares.",
    [tangibleBook.concept, shares?.concept ?? "ordinarySharesNumber"],
    "Derived only when Yahoo reports same-date tangible book value and ordinary shares.",
  );
}

function efficiencyRatioSpecializedMetric(values: YahooValue[]): SpecializedMetric {
  const netInterestIncome = latestFlowMetricFact(values, "NetInterestIncome");
  const nonInterestIncome = latestFlowMetricFact(values, "NonInterestIncome");
  const nonInterestExpense = latestFlowMetricFact(values, "NonInterestExpense", true);
  const definition = "Efficiency ratio from reported non-interest expense divided by reported net interest income plus non-interest income.";
  if (!netInterestIncome || !nonInterestIncome || !nonInterestExpense) return unavailableSpecializedMetric(definition);
  if (
    netInterestIncome.asOfDate !== nonInterestIncome.asOfDate
    || netInterestIncome.asOfDate !== nonInterestExpense.asOfDate
    || netInterestIncome.periodType !== nonInterestIncome.periodType
    || netInterestIncome.periodType !== nonInterestExpense.periodType
    || !sameMonetaryCurrency([netInterestIncome, nonInterestIncome, nonInterestExpense])
  ) {
    return unavailableSpecializedMetric(definition);
  }
  const denominator = netInterestIncome.value + nonInterestIncome.value;
  const value = denominator > 0 ? Math.abs(nonInterestExpense.value) / denominator : null;
  return derivedSpecializedMetric(
    value,
    nonInterestExpense.asOfDate,
    definition,
    [
      ...(nonInterestExpense.provenance.inputs ?? [nonInterestExpense.concept]),
      ...(netInterestIncome.provenance.inputs ?? [netInterestIncome.concept]),
      ...(nonInterestIncome.provenance.inputs ?? [nonInterestIncome.concept]),
    ],
    "Derived only from same-period Yahoo bank income-statement facts.",
  );
}

function trailingDates(values: YahooValue[]): string[] {
  const anchors = new Set(["trailingTotalRevenue", "trailingNetIncome", "trailingOperatingCashFlow", "trailingOperatingIncome", "trailingTotalOperatingIncomeAsReported"]);
  return [...new Set(values
    .filter((item) => anchors.has(item.concept) && item.periodType === "TTM")
    .map((item) => item.asOfDate))]
    .sort();
}

function balanceDateFor(values: YahooValue[], flowDate: string): string | null {
  return latestAtOrBefore(values, ["quarterlyTotalAssets", "quarterlyStockholdersEquity", "quarterlyCashAndCashEquivalents"], flowDate)?.asOfDate
    ?? latestAtOrBefore(values, ["annualTotalAssets", "annualStockholdersEquity", "annualCashAndCashEquivalents"], flowDate)?.asOfDate
    ?? null;
}
function normalizedTickerText(value: string | null | undefined): string {
  return (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function isTickerLikeMetadataName(name: string | null | undefined, symbol: string): boolean {
  if (!name) return false;
  const trimmed = name.trim();
  const symbolUpper = symbol.trim().toUpperCase();
  if (trimmed.toUpperCase() === symbolUpper) return true;
  if (trimmed.toUpperCase().startsWith(`${symbolUpper},`)) return true;
  return normalizedTickerText(trimmed) === normalizedTickerText(symbol);
}

function issuerNameForClassification(metadata: YahooMetadata, symbol: string, fallbackName?: string | null): string | null {
  if (metadata.name && !isTickerLikeMetadataName(metadata.name, symbol)) return metadata.name;
  return fallbackName ?? metadata.name;
}

function classifyYahooMetadata(metadata: YahooMetadata, symbol: string, fallbackName?: string | null) {
  const description = [metadata.industry, metadata.sector].filter(Boolean).join(" ");
  const classified = classifyCompany({ sicDescription: description, name: issuerNameForClassification(metadata, symbol, fallbackName) });
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

function buildYahooSpecializedData(
  values: YahooValue[],
  archetype: AnalysisArchetype,
): SpecializedCompanyData | undefined {
  const missing = unavailableSpecializedMetric;
  if (archetype === "bank") {
    return {
      kind: "bank",
      netInterestIncome: specializedMetricFromFlowFact(latestFlowMetricFact(values, "NetInterestIncome"), "Reported net interest income after interest expense."),
      netInterestMargin: missing("Reported net interest margin; not inferred from period-end assets."),
      grossLoans: yahooSpecializedMetric(latestBalanceFrom(values, BANK_LOAN_BALANCE_FIELDS), "Reported loans receivable or reported net loan balance."),
      deposits: yahooSpecializedMetric(latestBalance(values, "TotalDeposits"), "Reported customer deposits."),
      depositGrowth: growthSpecializedMetric(values, "TotalDeposits", "Deposit growth from comparable reported annual deposit balances."),
      netInterestIncomeGrowth: growthSpecializedMetric(values, "NetInterestIncome", "Net interest income growth from comparable reported annual periods."),
      grossLoanGrowth: growthSpecializedMetricFrom(values, BANK_LOAN_BALANCE_FIELDS, "Gross loan growth from comparable reported annual loan balances."),
      fundingCost: missing("Reported funding cost."),
      cet1CapitalRatio: missing("Reported common equity tier 1 capital ratio."),
      tangibleCommonEquity: yahooSpecializedMetric(latestBalance(values, "TangibleBookValue"), "Reported tangible common equity / tangible book value."),
      tangibleBookValuePerShare: tangibleBookValuePerShare(values),
      nonPerformingLoans: missing("Reported nonperforming loans."),
      netChargeOffs: missing("Reported net charge-offs."),
      loanLossProvisions: specializedMetricFromFlowFact(latestFlowMetricFact(values, "CreditLossesProvision", true), "Reported provision for credit losses."),
      efficiencyRatio: efficiencyRatioSpecializedMetric(values),
      returnOnAssets: returnOnAverageAnnualBalance(values, "TotalAssets", "Return on average assets from annual net income and average reported assets."),
      returnOnEquity: returnOnAverageAnnualBalance(values, "CommonStockEquity", "Return on average common equity from annual net income and average reported common equity."),
      returnOnTangibleCommonEquity: returnOnAverageAnnualBalance(values, "TangibleBookValue", "Return on average tangible common equity from annual net income and average reported tangible book value."),
    };
  }
  if (archetype === "insurer") {
    return {
      kind: "insurer",
      premiumGrowth: growthSpecializedMetricFrom(values, INSURER_PREMIUM_FIELDS, "Premium growth from comparable reported annual premium balances."),
      combinedRatio: combinedRatioSpecializedMetric(values),
      lossRatio: samePeriodRatioSpecializedMetricFrom(
        values,
        INSURER_LOSS_FIELDS,
        INSURER_PREMIUM_FIELDS,
        "Loss ratio from reported loss-adjustment expense divided by reported premiums.",
        "Derived only from same-period Yahoo insurer loss and premium facts.",
      ),
      expenseRatio: samePeriodRatioSpecializedMetricFrom(
        values,
        INSURER_EXPENSE_FIELDS,
        INSURER_PREMIUM_FIELDS,
        "Expense ratio from reported underwriting expense divided by reported premiums.",
        "Derived only from same-period Yahoo insurer underwriting-expense and premium facts.",
      ),
      bookValue: yahooSpecializedMetric(latestBalanceFrom(values, INSURER_BOOK_FIELDS), "Reported shareholders' equity / book value."),
      tangibleBookValue: yahooSpecializedMetric(latestBalance(values, "TangibleBookValue"), "Reported tangible book value."),
      returnOnEquity: returnOnAverageAnnualBalance(values, "CommonStockEquity", "Return on average common equity from annual net income and average reported common equity."),
      regulatoryCapitalRatio: missing("Reported risk-based regulatory capital ratio."),
      reserveDevelopment: missing("Reported prior-year reserve development."),
    };
  }
  return undefined;
}
async function fetchJson(url: URL): Promise<AdapterResult<JsonObject>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), YAHOO_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json", "user-agent": "Mozilla/5.0 StockBox/1.0" },
      signal: controller.signal,
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
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return failure(
      timedOut ? "timeout" : "upstream_error",
      timedOut
        ? "Yahoo Finance fundamentals request timed out."
        : "Yahoo Finance fundamentals could not be reached or parsed.",
    );
  } finally {
    clearTimeout(timeout);
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

function yahooCompanyFromQuote(quote: JsonObject): CompanySearchResult | null {
  const symbol = stringValue(quote.symbol)?.toUpperCase();
  const name = stringValue(quote.longname)
    ?? stringValue(quote.longName)
    ?? stringValue(quote.shortname)
    ?? stringValue(quote.shortName);
  const quoteType = stringValue(quote.quoteType)?.toUpperCase()
    ?? stringValue(quote.instrumentType)?.toUpperCase()
    ?? null;
  if (!symbol || !name || !["EQUITY", "ETF", "MUTUALFUND"].includes(quoteType ?? "")) return null;
  const securityType = inferSecurityType({
    ticker: symbol,
    canonicalTicker: symbol,
    name,
    securityType: yahooSecurityType(quoteType, name),
  });
  return {
    ticker: symbol,
    canonicalTicker: symbol,
    name,
    exchange: stringValue(quote.exchDisp)
      ?? stringValue(quote.fullExchangeName)
      ?? stringValue(quote.exchangeName)
      ?? stringValue(quote.exchange)
      ?? undefined,
    country: stringValue(quote.country) ?? undefined,
    currency: stringValue(quote.currency) ?? undefined,
    securityType,
    providerTickers: [symbol],
    providerCapabilities: { fundamentals: securityType === "Common Stock", marketData: true, providerIds: ["yahoo-search", PROVIDER_ID] },
  };
}

function exactTickerLikeQuery(query: string): boolean {
  return /^[A-Z0-9][A-Z0-9.-]{0,24}$/i.test(query.trim()) && !query.includes(" ");
}

function yahooSymbolVariants(query: string): string[] {
  const symbol = query.trim().toUpperCase();
  const variants = [symbol];
  if (/^[A-Z]{1,6}\.[A-Z]$/.test(symbol)) variants.push(symbol.replace(".", "-"));
  return [...new Set(variants)];
}

function yahooSymbolsEquivalent(requested: string, returned: string): boolean {
  const variants = yahooSymbolVariants(requested);
  return variants.includes(returned.trim().toUpperCase());
}

async function fetchExactChartCompany(query: string): Promise<CompanySearchResult | null> {
  if (!exactTickerLikeQuery(query)) return null;
  for (const symbol of yahooSymbolVariants(query)) {
    const url = new URL(`${CHART_BASE}/${encodeURIComponent(symbol)}`);
    url.searchParams.set("range", "5d");
    url.searchParams.set("interval", "1d");
    const response = await fetchJson(url);
    if (!response.ok) continue;
    const chart = object(response.data.chart);
    const results = Array.isArray(chart?.result) ? chart.result : [];
    const meta = object(object(results[0])?.meta);
    if (!meta) continue;
    const company = yahooCompanyFromQuote(meta);
    if (!company || !yahooSymbolsEquivalent(query, company.ticker)) continue;
    return {
      ...company,
      providerTickers: [...new Set([...(company.providerTickers ?? []), query.trim().toUpperCase()])],
    };
  }
  return null;
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
    const quotes = Array.isArray(response.data.quotes)
      ? response.data.quotes.map(object).filter((quote): quote is JsonObject => Boolean(quote))
      : [];
    const data = quotes.flatMap((quote) => {
      const company = yahooCompanyFromQuote(quote);
      return company ? [company] : [];
    });
    const hasExact = data.some((company) => yahooSymbolsEquivalent(query, company.ticker));
    if (!hasExact) {
      const directCompany = await fetchExactChartCompany(query);
      if (directCompany && !data.some((company) => company.ticker === directCompany.ticker)) {
        data.unshift(directCompany);
      }
    }
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
    freeCashFlow: period.freeCashFlow ?? null,
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
  const reportedTrailingDates = trailingDates(values);
  const buildTrailing = (flowDate: string | undefined): FinancialPeriod | undefined => {
    if (!flowDate) return undefined;
    const balanceDate = balanceDateFor(values, flowDate);
    if (!balanceDate) return undefined;
    const balancePrefix = values.some((item) => item.asOfDate === balanceDate && item.concept.startsWith("quarterly"))
      ? "quarterly" as const
      : "annual" as const;
    return buildPeriod(values, "trailing", flowDate, balancePrefix, balanceDate);
  };
  const trailingTwelveMonths = buildTrailing(reportedTrailingDates.at(-1));
  const priorTrailingTwelveMonths = buildTrailing(reportedTrailingDates.at(-2));
  const issuerName = issuerNameForClassification(metadata, symbol, company.name);
  const classification = classifyYahooMetadata(metadata, symbol, company.name);
  const marketCapFact = latest(values, "trailingMarketCap", "TTM");
  const enterpriseValueFact = latest(values, "trailingEnterpriseValue", "TTM");
  const priceEarningsFact = latest(values, "trailingPeRatio", "TTM");
  const priceSalesFact = latest(values, "trailingPsRatio", "TTM");
  const priceBookFact = latest(values, "trailingPbRatio", "TTM");
  const pegFact = latest(values, "trailingPegRatio", "TTM");
  const evSalesFact = latest(values, "trailingEnterprisesValueRevenueRatio", "TTM");
  const evEbitdaFact = latest(values, "trailingEnterprisesValueEBITDARatio", "TTM");
  const freeCashFlowFact = latest(values, "trailingFreeCashFlow", "TTM");
  const valuationAsOfDate = [priceEarningsFact, priceSalesFact, priceBookFact, pegFact, evSalesFact, evEbitdaFact, marketCapFact]
    .flatMap((fact) => fact?.asOfDate ? [fact.asOfDate] : [])
    .sort()
    .at(-1) ?? null;
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
      name: issuerName ?? company.name,
      entityId: company.entityId ?? company.issuerId,
      sector: classification.sector,
      industry: classification.industry,
      analysisArchetype: classification.analysisArchetype,
      classificationDiagnostics: classification.classificationDiagnostics,
      specialized: buildYahooSpecializedData(values, classification.analysisArchetype),
      annual: annualPeriods.map(toLegacy),
      annualPeriods,
      trailingTwelveMonths,
      priorTrailingTwelveMonths,
      reportedMarketCap: marketCapFact?.value ?? null,
      reportedMarketCapDate: marketCapFact?.asOfDate ?? null,
      reportedMarketCapCurrency: marketCapFact?.currencyCode ?? null,
      reportedSharesOutstanding: sharesFact?.value ?? null,
      reportedSharesDate: sharesFact?.asOfDate ?? null,
      reportedValuation: {
        provider: "Yahoo Finance fundamentals timeseries",
        asOfDate: valuationAsOfDate,
        priceEarnings: priceEarningsFact?.value ?? null,
        priceSales: priceSalesFact?.value ?? null,
        priceBook: priceBookFact?.value ?? null,
        evSales: evSalesFact?.value ?? null,
        evEbitda: evEbitdaFact?.value ?? null,
        peg: pegFact?.value ?? null,
        marketCap: marketCapFact?.value ?? null,
        marketCapCurrency: marketCapFact?.currencyCode ?? null,
        enterpriseValue: enterpriseValueFact?.value ?? null,
        enterpriseValueCurrency: enterpriseValueFact?.currencyCode ?? null,
        freeCashFlow: freeCashFlowFact?.value ?? null,
        freeCashFlowCurrency: freeCashFlowFact?.currencyCode ?? null,
        freeCashFlowDate: freeCashFlowFact?.asOfDate ?? null,
      },
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
