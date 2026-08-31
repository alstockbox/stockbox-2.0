import { readFileSync, writeFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const write = (path, content) => writeFileSync(path, content, "utf8");

function replaceOnce(path, from, to, label) {
  const source = read(path);
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match in ${path}, found ${count}`);
  write(path, source.replace(from, to));
}

// ---------- Shared analysis types ----------
replaceOnce(
  "src/lib/analysis/types.ts",
  'export type FinancialPeriodBasis = "FY" | "TTM_REPORTED" | "TTM_Q1_3M" | "TTM_Q2_6M" | "TTM_Q3_9M";',
  'export type FinancialPeriodBasis = "FY" | "TTM_REPORTED" | "TTM_Q1_3M" | "TTM_Q2_6M" | "TTM_Q3_9M" | "TTM_FROM_QUARTERS";',
  "TTM-from-quarters period basis",
);

replaceOnce(
  "src/lib/analysis/types.ts",
  `export type MarketPricePoint = {
  date: string;
  close: number;
};

export type MarketSnapshot = {`,
  `export type MarketPricePoint = {
  date: string;
  close: number;
};

export type MarketDividendEvent = {
  date: string;
  amount: number;
  currency?: string | null;
  provider?: string;
};

export type MarketSplitEvent = {
  date: string;
  numerator: number | null;
  denominator: number | null;
  splitRatio: number | null;
  provider?: string;
};

export type HistoricalTtmEpsPoint = {
  periodEndDate: string;
  epsDiluted: number;
  currency: string | null;
  basis: "TTM_FROM_QUARTERS";
  provenance: MetricProvenance;
};

export type MarketSnapshot = {`,
  "market event and historical EPS types",
);

replaceOnce(
  "src/lib/analysis/types.ts",
  `  priceHistory?: MarketPricePoint[];
  performance: Partial<Record<"1D" | "1W" | "1M" | "3M" | "6M" | "YTD" | "1Y", number>>;`,
  `  priceHistory?: MarketPricePoint[];
  priceHistoryBasis?: "adjusted_close" | "close";
  dividendEvents?: MarketDividendEvent[];
  splitEvents?: MarketSplitEvent[];
  performance: Partial<Record<"1D" | "1W" | "1M" | "3M" | "6M" | "YTD" | "1Y", number>>;`,
  "market snapshot history metadata",
);

replaceOnce(
  "src/lib/analysis/types.ts",
  `  trailingTwelveMonths?: FinancialPeriod;
  priorTrailingTwelveMonths?: FinancialPeriod;
  specialized?: SpecializedCompanyData;`,
  `  trailingTwelveMonths?: FinancialPeriod;
  priorTrailingTwelveMonths?: FinancialPeriod;
  historicalTtmEps?: HistoricalTtmEpsPoint[];
  specialized?: SpecializedCompanyData;`,
  "company historical TTM EPS",
);

replaceOnce(
  "src/lib/analysis/types.ts",
  `export type HistoricalResearchData = {
  financials: HistoricalFinancialPoint[];
  price: MarketPricePoint[];`,
  `export type HistoricalValuationPoint = {
  date: string;
  priceDate: string | null;
  referencePrice: number | null;
  ttmEps: number | null;
  priceEarnings: number | null;
  priceEarningsStatus: "available" | "not_meaningful" | "unavailable";
  trailingDividendsPerShare: number | null;
  dividendPaymentCount: number;
  dividendYield: number | null;
  epsProvenance?: MetricProvenance;
};

export type HistoricalValuationWindowStats = {
  requestedYears: 3 | 5 | 10 | null;
  firstDate: string | null;
  lastDate: string | null;
  spanYears: number;
  sufficientHistory: boolean;
  observationCount: number;
  peObservationCount: number;
  priceEarningsMedian: number | null;
  priceEarningsAverage: number | null;
  dividendYieldObservationCount: number;
  dividendYieldAverage: number | null;
};

export type HistoricalValuationContext = {
  methodVersion: string;
  currentPriceEarnings: number | null;
  currentDividendYield: number | null;
  currentTrailingDividendsPerShare: number | null;
  currentDividendPaymentCount: number;
  currentPeVsReferenceMedian: number | null;
  referenceWindow: "5Y" | "MAX";
  referencePriceEarningsMedian: number | null;
  availableSince: string | null;
  threeYear: HistoricalValuationWindowStats;
  fiveYear: HistoricalValuationWindowStats;
  tenYear: HistoricalValuationWindowStats;
  maximum: HistoricalValuationWindowStats;
};

export type HistoricalResearchData = {
  financials: HistoricalFinancialPoint[];
  price: MarketPricePoint[];
  valuation?: HistoricalValuationPoint[];
  valuationContext?: HistoricalValuationContext;
  valuationMethodVersion?: string;`,
  "historical valuation research types",
);

// ---------- Yahoo fundamentals: quarterly diluted EPS -> rolling TTM ----------
replaceOnce(
  "src/lib/data/yahoo-fundamentals.ts",
  `  FinancialPeriod,
  MetricProvenance,`,
  `  FinancialPeriod,
  HistoricalTtmEpsPoint,
  MetricProvenance,`,
  "Yahoo historical EPS type import",
);

replaceOnce(
  "src/lib/data/yahoo-fundamentals.ts",
  `  ...INSURER_FLOW_FIELDS.flatMap((field) => [\`annual\${field}\`, \`trailing\${field}\`]),
  "trailingMarketCap",`,
  `  ...INSURER_FLOW_FIELDS.flatMap((field) => [\`annual\${field}\`, \`trailing\${field}\`]),
  "quarterlyDilutedEPS",
  "trailingMarketCap",`,
  "request quarterly diluted EPS",
);

replaceOnce(
  "src/lib/data/yahoo-fundamentals.ts",
  `function hasQuarterlyCadence(facts: YahooValue[]): boolean {
  for (let index = 1; index < facts.length; index += 1) {
    const gapDays = (Date.parse(facts[index].asOfDate) - Date.parse(facts[index - 1].asOfDate)) / 86_400_000;
    if (!Number.isFinite(gapDays) || gapDays < 70 || gapDays > 115) return false;
  }
  return true;
}

function latestFourQuarterFlowFact`,
  `function hasQuarterlyCadence(facts: YahooValue[]): boolean {
  for (let index = 1; index < facts.length; index += 1) {
    const gapDays = (Date.parse(facts[index].asOfDate) - Date.parse(facts[index - 1].asOfDate)) / 86_400_000;
    if (!Number.isFinite(gapDays) || gapDays < 70 || gapDays > 115) return false;
  }
  return true;
}

function historicalTtmEps(values: YahooValue[]): HistoricalTtmEpsPoint[] {
  const facts = quarterlyFlowFacts(values, "DilutedEPS");
  const points: HistoricalTtmEpsPoint[] = [];
  for (let index = 3; index < facts.length; index += 1) {
    const window = facts.slice(index - 3, index + 1);
    if (window.length !== 4 || !hasQuarterlyCadence(window)) continue;
    const currencies = [...new Set(window.map((fact) => fact.currencyCode?.trim().toUpperCase()).filter((value): value is string => Boolean(value)))];
    if (currencies.length > 1) continue;
    const latestFact = window[3];
    const epsDiluted = window.reduce((sum, fact) => sum + fact.value, 0);
    if (!Number.isFinite(epsDiluted)) continue;
    points.push({
      periodEndDate: latestFact.asOfDate,
      epsDiluted,
      currency: currencies[0] ?? null,
      basis: "TTM_FROM_QUARTERS",
      provenance: {
        source: "Yahoo Finance fundamentals timeseries",
        provider: PROVIDER_ID,
        unit: currencies[0] ?? undefined,
        periodEnd: latestFact.asOfDate,
        periodBasis: "TTM_FROM_QUARTERS",
        inputs: window.map((fact) => \`\${fact.concept}@\${fact.asOfDate}\`),
        valueKind: "derived",
        note: "Diluted TTM EPS derived only from four consecutive Yahoo 3M diluted-EPS facts with 70-115 day quarterly cadence.",
      },
    });
  }
  return points.slice(-41);
}

function latestFourQuarterFlowFact`,
  "historical rolling TTM EPS builder",
);

replaceOnce(
  "src/lib/data/yahoo-fundamentals.ts",
  `  const values = seriesResult.data;
  const dates = annualDates(values);`,
  `  const values = seriesResult.data;
  const historicalTtmEpsPoints = historicalTtmEps(values);
  const dates = annualDates(values);`,
  "construct historical TTM EPS",
);

replaceOnce(
  "src/lib/data/yahoo-fundamentals.ts",
  `      trailingTwelveMonths,
      priorTrailingTwelveMonths,
      reportedMarketCap:`,
  `      trailingTwelveMonths,
      priorTrailingTwelveMonths,
      historicalTtmEps: historicalTtmEpsPoints,
      reportedMarketCap:`,
  "return historical TTM EPS",
);

// ---------- Yahoo chart: preserve dividend/split events ----------
replaceOnce(
  "src/lib/data/yahoo-market.ts",
  'import type { CompanySearchResult, MarketPricePoint, MarketSnapshot } from "@/lib/analysis/types";',
  'import type { CompanySearchResult, MarketDividendEvent, MarketPricePoint, MarketSnapshot, MarketSplitEvent } from "@/lib/analysis/types";',
  "Yahoo market event imports",
);

replaceOnce(
  "src/lib/data/yahoo-market.ts",
  `function monthlyPriceHistory(rows: PriceRow[]): MarketPricePoint[] {`,
  `function parseDividendEvents(result: JsonObject, currency: string | null): MarketDividendEvent[] {
  const events = object(result.events);
  const dividends = object(events?.dividends);
  if (!dividends) return [];
  const deduped = new Map<string, MarketDividendEvent>();
  for (const eventValue of Object.values(dividends)) {
    const event = object(eventValue);
    const amount = numberValue(event?.amount);
    const date = dateFromUnix(numberValue(event?.date) ?? Number.NaN);
    if (!date || amount === null || amount <= 0 || Date.parse(\`\${date}T00:00:00Z\`) > Date.now()) continue;
    deduped.set(\`\${date}:\${amount}\`, { date, amount, currency, provider: PROVIDER_ID });
  }
  return [...deduped.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function parseSplitEvents(result: JsonObject): MarketSplitEvent[] {
  const events = object(result.events);
  const splits = object(events?.splits);
  if (!splits) return [];
  return Object.values(splits).flatMap((eventValue) => {
    const event = object(eventValue);
    const date = dateFromUnix(numberValue(event?.date) ?? Number.NaN);
    if (!date || Date.parse(\`\${date}T00:00:00Z\`) > Date.now()) return [];
    const numerator = numberValue(event?.numerator);
    const denominator = numberValue(event?.denominator);
    const ratioFromNumbers = numerator !== null && denominator !== null && numerator > 0 && denominator > 0 ? numerator / denominator : null;
    const ratioText = stringValue(event?.splitRatio);
    const ratioParts = ratioText?.split(":").map(Number) ?? [];
    const ratioFromText = ratioParts.length === 2 && Number.isFinite(ratioParts[0]) && Number.isFinite(ratioParts[1]) && ratioParts[1] > 0
      ? ratioParts[0] / ratioParts[1]
      : null;
    return [{ date, numerator, denominator, splitRatio: ratioFromNumbers ?? ratioFromText, provider: PROVIDER_ID }];
  }).sort((left, right) => left.date.localeCompare(right.date));
}

function monthlyPriceHistory(rows: PriceRow[]): MarketPricePoint[] {`,
  "Yahoo dividend and split event parsers",
);

replaceOnce(
  "src/lib/data/yahoo-market.ts",
  `    const yearRows = lastYearRows(history);
    const yearHigh =`,
  `    const yearRows = lastYearRows(history);
    const marketCurrency = stringValue(meta.currency) ?? company.currency ?? null;
    const dividendEvents = parseDividendEvents(result, marketCurrency);
    const splitEvents = parseSplitEvents(result);
    const yearHigh =`,
  "parse Yahoo corporate actions",
);

replaceOnce(
  "src/lib/data/yahoo-market.ts",
  `        price,
        currency: stringValue(meta.currency) ?? company.currency ?? null,`,
  `        price,
        currency: marketCurrency,`,
  "reuse normalized Yahoo market currency",
);

replaceOnce(
  "src/lib/data/yahoo-market.ts",
  `        priceHistory: monthlyPriceHistory(history),
        performance: performance(history),`,
  `        priceHistory: monthlyPriceHistory(history),
        priceHistoryBasis: "adjusted_close",
        dividendEvents,
        splitEvents,
        performance: performance(history),`,
  "return Yahoo corporate actions",
);

// ---------- Historical research: remove annual-EPS valuation and use TTM engine ----------
replaceOnce(
  "src/lib/analysis/historical.ts",
  `  HistoricalResearchData,
  MarketPricePoint,
} from "./types";`,
  `  HistoricalResearchData,
  HistoricalTtmEpsPoint,
  MarketDividendEvent,
  MarketPricePoint,
} from "./types";`,
  "historical valuation option types",
);

replaceOnce(
  "src/lib/analysis/historical.ts",
  `import { deriveSimpleFreeCashFlow, shareBasisComparable, sortFinancialPeriods } from "./metrics";`,
  `import { deriveSimpleFreeCashFlow, shareBasisComparable, sortFinancialPeriods } from "./metrics";
import {
  buildHistoricalValuationContext,
  buildHistoricalValuationSeries,
  HISTORICAL_VALUATION_METHOD_VERSION,
} from "./historical-valuation";`,
  "historical valuation engine import",
);

replaceOnce(
  "src/lib/analysis/historical.ts",
  `  const positivePrice = positive(price);
  const positiveEps = positive(period.epsDiluted);
  const positiveNetIncome = positive(period.netIncome);`,
  `  const positiveNetIncome = positive(period.netIncome);`,
  "remove annual P/E inputs",
);

replaceOnce(
  "src/lib/analysis/historical.ts",
  `  const priceEarnings = positivePrice !== null && positiveEps !== null
    ? positivePrice / positiveEps
    : null;

  return {`,
  `  return {`,
  "remove annual P/E calculation",
);

replaceOnce(
  "src/lib/analysis/historical.ts",
  `    referencePrice: price,
    priceEarnings,
    dividendYield: positivePrice !== null && isFiniteNumber(dividendPerShare)
      ? dividendPerShare / positivePrice
      : null,`,
  `    referencePrice: price,
    // Historical valuation is intentionally not derived from annual EPS or annualized cash dividends.
    // Correct TTM valuation lives in HistoricalResearchData.valuation.
    priceEarnings: null,
    dividendYield: null,`,
  "disable legacy annual valuation formulas",
);

replaceOnce(
  "src/lib/analysis/historical.ts",
  `export function buildHistoricalResearchData(
  annualPeriods: FinancialPeriod[],
  priceHistory: MarketPricePoint[] = [],
): HistoricalResearchData {`,
  `export type HistoricalResearchOptions = {
  ttmEpsHistory?: HistoricalTtmEpsPoint[];
  dividendEvents?: MarketDividendEvent[];
  currentPriceEarnings?: number | null;
};

export function buildHistoricalResearchData(
  annualPeriods: FinancialPeriod[],
  priceHistory: MarketPricePoint[] = [],
  options: HistoricalResearchOptions = {},
): HistoricalResearchData {`,
  "historical research valuation options",
);

replaceOnce(
  "src/lib/analysis/historical.ts",
  `  const dividendStats = dividendStreakStats(points);

  return {`,
  `  const dividendStats = dividendStreakStats(points);
  const valuation = buildHistoricalValuationSeries({
    prices: sortedPrices,
    ttmEps: options.ttmEpsHistory ?? [],
    dividendEvents: options.dividendEvents,
  });
  const valuationContext = buildHistoricalValuationContext({
    series: valuation,
    currentPriceEarnings: options.currentPriceEarnings,
    prices: sortedPrices,
    dividendEvents: options.dividendEvents,
  });

  return {`,
  "build TTM valuation history",
);

replaceOnce(
  "src/lib/analysis/historical.ts",
  `    financials: points.slice(-10),
    price: sortedPrices,`,
  `    financials: points.slice(-10),
    price: sortedPrices,
    valuation,
    valuationContext,
    valuationMethodVersion: HISTORICAL_VALUATION_METHOD_VERSION,`,
  "return valuation history",
);

// ---------- Report engine wiring ----------
replaceOnce(
  "src/lib/analysis/engine.ts",
  `      ? buildHistoricalResearchData(canonicalInput.annualPeriods, legacyInput.market?.priceHistory ?? [])
      : undefined,`,
  `      ? buildHistoricalResearchData(canonicalInput.annualPeriods, legacyInput.market?.priceHistory ?? [], {
          ttmEpsHistory: legacyInput.fundamentals?.historicalTtmEps,
          dividendEvents: legacyInput.market?.dividendEvents,
          currentPriceEarnings: result.metrics.valuation.priceEarnings,
        })
      : undefined,`,
  "wire historical TTM valuation into report",
);

// ---------- CSV export: financial statements and TTM valuation are separate sections ----------
replaceOnce(
  "src/lib/analysis/financial-data-export.ts",
  `  "freeCashFlowPayoutRatio",
  "referencePrice",
  "priceEarnings",
  "dividendYield",
] as const;`,
  `  "freeCashFlowPayoutRatio",
  "referencePrice",
] as const;`,
  "remove legacy annual valuation columns",
);

replaceOnce(
  "src/lib/analysis/financial-data-export.ts",
  `export function historicalFinancialsCsv(historical: HistoricalResearchData): string {
  const rows = historical.financials.map((point) =>
    historicalHeaders.map((header: HistoricalHeader) => csvCell(point[header])).join(",")
  );
  return [historicalHeaders.join(","), ...rows].join("\\n");
}`, 
  `export function historicalFinancialsCsv(historical: HistoricalResearchData): string {
  const rows = historical.financials.map((point) =>
    historicalHeaders.map((header: HistoricalHeader) => csvCell(point[header])).join(",")
  );
  const valuationHeaders = [
    "date", "priceDate", "referencePrice", "ttmEps", "priceEarnings", "priceEarningsStatus",
    "trailingDividendsPerShare", "dividendPaymentCount", "dividendYield",
  ] as const;
  const valuationRows = (historical.valuation ?? []).map((point) =>
    valuationHeaders.map((header) => csvCell(point[header])).join(",")
  );
  const valuationSection = valuationRows.length
    ? [
        "",
        \`historicalValuationMethodVersion,\${csvCell(historical.valuationMethodVersion)}\`,
        valuationHeaders.join(","),
        ...valuationRows,
      ]
    : [];
  return [historicalHeaders.join(","), ...rows, ...valuationSection].join("\\n");
}`,
  "export TTM valuation separately",
);

// ---------- Historical UI ----------
replaceOnce(
  "src/components/analysis/historical-research.tsx",
  `  HistoricalFinancialPoint,
  UiMode,`,
  `  HistoricalFinancialPoint,
  HistoricalValuationPoint,
  UiMode,`,
  "historical valuation UI type",
);

replaceOnce(
  "src/components/analysis/historical-research.tsx",
  `    referencePrice: "Referenspris", dividendYield: "Direktavkastning", dividendPerShare: "Utdelning/aktie",
    years: "år", reportedDerived:`,
  `    referencePrice: "Referenspris", dividendYield: "Direktavkastning", dividendPerShare: "Utdelning/aktie",
    currentPe: "P/E nu", historicalPeMedian: "Historisk median P/E", peVsHistory: "Mot historisk median",
    tenYearPeMedian: "10 års median P/E", currentYield: "Direktavkastning nu", historicalYieldAverage: "Historiskt snitt yield",
    ttmEps: "TTM EPS", ttmDividend: "TTM utdelning/aktie", valuationDate: "Datum", insufficientHistory: "Otillräcklig historik",
    years: "år", reportedDerived:`,
  "Swedish valuation copy",
);

replaceOnce(
  "src/components/analysis/historical-research.tsx",
  `    referencePrice: "Reference price", dividendYield: "Dividend yield", dividendPerShare: "Dividend / share",
    years: "years", reportedDerived:`,
  `    referencePrice: "Reference price", dividendYield: "Dividend yield", dividendPerShare: "Dividend / share",
    currentPe: "Current P/E", historicalPeMedian: "Historical median P/E", peVsHistory: "Vs historical median",
    tenYearPeMedian: "10Y median P/E", currentYield: "Current dividend yield", historicalYieldAverage: "Historical yield average",
    ttmEps: "TTM EPS", ttmDividend: "TTM dividend / share", valuationDate: "Date", insufficientHistory: "Insufficient history",
    years: "years", reportedDerived:`,
  "English valuation copy",
);

replaceOnce(
  "src/components/analysis/historical-research.tsx",
  `function peLabel(point: HistoricalFinancialPoint, notMeaningful: string, unavailable: string, locale: Locale) {
  if (isNumber(point.priceEarnings)) return formatNumber(point.priceEarnings, locale, unavailable, 1);
  if (isNumber(point.eps) && point.eps <= 0) return notMeaningful;
  return unavailable;
}`, 
  `function peLabel(point: HistoricalValuationPoint, notMeaningful: string, unavailable: string, locale: Locale) {
  if (isNumber(point.priceEarnings)) return formatNumber(point.priceEarnings, locale, unavailable, 1);
  if (point.priceEarningsStatus === "not_meaningful") return notMeaningful;
  return unavailable;
}`,
  "TTM P/E label semantics",
);

replaceOnce(
  "src/components/analysis/historical-research.tsx",
  `  const extra = extraCopyFor(locale);
  const latest = latestFinancial(historical.financials);
  return (`,
  `  const extra = extraCopyFor(locale);
  const latest = latestFinancial(historical.financials);
  const valuation = historical.valuationContext;
  return (`,
  "dividend snapshot valuation context",
);

replaceOnce(
  "src/components/analysis/historical-research.tsx",
  `        <Stat label={extra.latestDps} value={formatMoney(latest?.dividendPerShare ?? null, latest?.currency ?? report.reportingCurrency, locale, copy.unavailable, false)} />
        <Stat label={extra.latestYield} value={formatPercent(latest?.dividendYield ?? null, locale, copy.unavailable)} />`,
  `        <Stat label={extra.latestDps} value={formatMoney(valuation?.currentTrailingDividendsPerShare ?? null, latest?.currency ?? report.reportingCurrency, locale, copy.unavailable, false)} />
        <Stat label={extra.latestYield} value={formatPercent(valuation?.currentDividendYield ?? null, locale, copy.unavailable)} />`,
  "event-based current dividend snapshot",
);

replaceOnce(
  "src/components/analysis/historical-research.tsx",
  `  const copy = copyFor(locale);
  const extra = extraCopyFor(locale);
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-[#f4efe5]">{copy.historicalContext}</h2>`,
  `  const copy = copyFor(locale);
  const extra = extraCopyFor(locale);
  const valuation = historical.valuationContext;
  const referenceLabel = valuation?.referenceWindow === "5Y"
    ? \`5Y \${extra.historicalPeMedian}\`
    : \`MAX \${extra.historicalPeMedian}\${valuation?.availableSince ? \` (\${valuation.availableSince.slice(0, 4)}-)\` : ""}\`;
  const yieldWindow = valuation?.fiveYear.sufficientHistory ? valuation.fiveYear : valuation?.maximum;
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-[#f4efe5]">{copy.historicalContext}</h2>`,
  "historical overview valuation context",
);

replaceOnce(
  "src/components/analysis/historical-research.tsx",
  `      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={extra.revenueCagr3y} value={formatPercent(historical.revenueCagr3y, locale, copy.unavailable)} />
        <Stat label={extra.revenueCagr10y} value={formatPercent(historical.revenueCagr10y, locale, copy.unavailable)} />
        <Stat label={extra.epsCagr3y} value={formatPercent(historical.epsCagr3y, locale, copy.unavailable)} />
        <Stat label={extra.epsCagr10y} value={formatPercent(historical.epsCagr10y, locale, copy.unavailable)} />
      </div>`,
  `      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={extra.revenueCagr3y} value={formatPercent(historical.revenueCagr3y, locale, copy.unavailable)} />
        <Stat label={extra.revenueCagr10y} value={formatPercent(historical.revenueCagr10y, locale, copy.unavailable)} />
        <Stat label={extra.epsCagr3y} value={formatPercent(historical.epsCagr3y, locale, copy.unavailable)} />
        <Stat label={extra.epsCagr10y} value={formatPercent(historical.epsCagr10y, locale, copy.unavailable)} />
      </div>
      {valuation ? (
        <div className="mt-5 border-t border-white/10 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[#f4efe5]">{copy.valuationHistory}</h3>
            <Badge>{valuation.methodVersion}</Badge>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Stat label={extra.currentPe} value={formatNumber(valuation.currentPriceEarnings, locale, copy.unavailable, 1)} />
            <Stat label={referenceLabel} value={formatNumber(valuation.referencePriceEarningsMedian, locale, copy.unavailable, 1)} />
            <Stat label={extra.peVsHistory} value={formatPercent(valuation.currentPeVsReferenceMedian, locale, copy.unavailable)} />
            <Stat label={extra.tenYearPeMedian} value={valuation.tenYear.sufficientHistory ? formatNumber(valuation.tenYear.priceEarningsMedian, locale, copy.unavailable, 1) : extra.insufficientHistory} />
            <Stat label={extra.currentYield} value={formatPercent(valuation.currentDividendYield, locale, copy.unavailable)} />
            <Stat label={valuation?.fiveYear.sufficientHistory ? \`5Y \${extra.historicalYieldAverage}\` : \`MAX \${extra.historicalYieldAverage}\`} value={formatPercent(yieldWindow?.dividendYieldAverage ?? null, locale, copy.unavailable)} />
          </div>
          <p className="mt-3 text-xs leading-5 text-[#9aa7b8]">
            {valuation.maximum.observationCount} TTM observations{valuation.availableSince ? \` · \${valuation.availableSince}–\${valuation.maximum.lastDate ?? ""}\` : ""}. {extra.reportedDerived}
          </p>
        </div>
      ) : null}`, 
  "visible Simple-mode valuation context",
);

replaceOnce(
  "src/components/analysis/historical-research.tsx",
  `function ValuationHistory({ report, locale }: { report: AnalysisReport; locale: Locale }) {
  const historical = report.historical;
  if (!historical) return null;
  const copy = copyFor(locale);
  const extra = extraCopyFor(locale);
  return (
    <Card>
      <h2 className="text-lg font-semibold text-[#f4efe5]">{copy.valuationHistory}</h2>
      <TableShell>
        <thead><tr>
          {[copy.fiscalYear, extra.referencePrice, extra.historicalPe, extra.dividendYield, extra.dividendPerShare, extra.payout, extra.fcfPayout].map((label) => <th key={label} className={headClass}>{label}</th>)}
        </tr></thead>
        <tbody>{historical.financials.map((point) => <tr key={point.fiscalYear}>
          <td className={cellClass}>{point.fiscalYear}</td>
          <td className={cellClass}>{formatMoney(point.referencePrice, point.currency ?? report.reportingCurrency, locale, copy.unavailable, false)}</td>
          <td className={cellClass}>{peLabel(point, copy.notMeaningful, copy.unavailable, locale)}</td>
          <td className={cellClass}>{formatPercent(point.dividendYield, locale, copy.unavailable)}</td>
          <td className={cellClass}>{formatMoney(point.dividendPerShare, point.currency ?? report.reportingCurrency, locale, copy.unavailable, false)}</td>
          <td className={cellClass}>{formatPercent(point.payoutRatio, locale, copy.unavailable)}</td>
          <td className={cellClass}>{formatPercent(point.freeCashFlowPayoutRatio, locale, copy.unavailable)}</td>
        </tr>)}</tbody>
      </TableShell>
    </Card>
  );
}`, 
  `function ValuationHistory({ report, locale }: { report: AnalysisReport; locale: Locale }) {
  const historical = report.historical;
  if (!historical) return null;
  const copy = copyFor(locale);
  const extra = extraCopyFor(locale);
  const points = historical.valuation ?? [];
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-[#f4efe5]">{copy.valuationHistory}</h2>
        {historical.valuationMethodVersion ? <Badge>{historical.valuationMethodVersion}</Badge> : null}
      </div>
      {!points.length ? <p className="mt-3 text-sm text-[#9aa7b8]">{extra.insufficientHistory}</p> : (
        <TableShell>
          <thead><tr>
            {[extra.valuationDate, extra.referencePrice, extra.ttmEps, extra.historicalPe, extra.ttmDividend, extra.dividendYield].map((label) => <th key={label} className={headClass}>{label}</th>)}
          </tr></thead>
          <tbody>{points.map((point) => <tr key={point.date}>
            <td className={cellClass}>{point.date}</td>
            <td className={cellClass}>{formatMoney(point.referencePrice, report.reportingCurrency, locale, copy.unavailable, false)}</td>
            <td className={cellClass}>{formatNumber(point.ttmEps, locale, copy.unavailable)}</td>
            <td className={cellClass}>{peLabel(point, copy.notMeaningful, copy.unavailable, locale)}</td>
            <td className={cellClass}>{formatMoney(point.trailingDividendsPerShare, report.reportingCurrency, locale, copy.unavailable, false)}</td>
            <td className={cellClass}>{formatPercent(point.dividendYield, locale, copy.unavailable)}</td>
          </tr>)}</tbody>
        </TableShell>
      )}
    </Card>
  );
}`,
  "render TTM valuation history",
);

replaceOnce(
  "src/components/analysis/historical-research.tsx",
  `          {[copy.fiscalYear, extra.dividendPerShare, extra.dividendYield, extra.payout, extra.fcfPayout].map((label) => <th key={label} className={headClass}>{label}</th>)}
        </tr></thead>
        <tbody>{historical.financials.map((point) => <tr key={point.fiscalYear}>
          <td className={cellClass}>{point.fiscalYear}</td>
          <td className={cellClass}>{formatMoney(point.dividendPerShare, point.currency ?? report.reportingCurrency, locale, copy.unavailable, false)}</td>
          <td className={cellClass}>{formatPercent(point.dividendYield, locale, copy.unavailable)}</td>
          <td className={cellClass}>{formatPercent(point.payoutRatio, locale, copy.unavailable)}</td>`,
  `          {[copy.fiscalYear, extra.dividendPerShare, extra.payout, extra.fcfPayout].map((label) => <th key={label} className={headClass}>{label}</th>)}
        </tr></thead>
        <tbody>{historical.financials.map((point) => <tr key={point.fiscalYear}>
          <td className={cellClass}>{point.fiscalYear}</td>
          <td className={cellClass}>{formatMoney(point.dividendPerShare, point.currency ?? report.reportingCurrency, locale, copy.unavailable, false)}</td>
          <td className={cellClass}>{formatPercent(point.payoutRatio, locale, copy.unavailable)}</td>`,
  "remove legacy annual dividend-yield display",
);

// ---------- Tests: old annual valuation must no longer be exported/labeled as historical TTM valuation ----------
replaceOnce(
  "tests/analysis/financial-data-export.test.ts",
  `    expect(csv).toContain("referencePrice,priceEarnings,dividendYield");
    expect(csv).toMatch(/40,,0\\.01$/);`,
  `    expect(csv.split("\\n")[0]).toContain("freeCashFlowPayoutRatio,referencePrice");
    expect(csv.split("\\n")[0]).not.toContain("priceEarnings");
    expect(csv.split("\\n")[0]).not.toContain("dividendYield");`,
  "export test separates annual and TTM valuation",
);

// Strong postconditions: the release blocker formulas must not remain in annual history.
const historicalSource = read("src/lib/analysis/historical.ts");
if (historicalSource.includes("positivePrice / positiveEps")) throw new Error("Legacy annual P/E formula remains");
if (historicalSource.includes("dividendPerShare / positivePrice")) throw new Error("Legacy annual dividend-yield formula remains");
if (!read("src/lib/data/yahoo-fundamentals.ts").includes('"quarterlyDilutedEPS"')) throw new Error("Quarterly diluted EPS request missing");
if (!read("src/lib/data/yahoo-market.ts").includes("dividendEvents,")) throw new Error("Dividend events are not returned by Yahoo market adapter");
if (!read("src/lib/analysis/engine.ts").includes("ttmEpsHistory: legacyInput.fundamentals?.historicalTtmEps")) throw new Error("Historical TTM EPS not wired into reports");

console.log("Historical valuation P0 patch applied with all guards satisfied.");
