import type { HistoricalResearchData } from "./types";

const historicalHeaders = [
  "fiscalYear",
  "periodEndDate",
  "currency",
  "revenue",
  "revenueGrowth",
  "eps",
  "epsGrowth",
  "netIncome",
  "freeCashFlow",
  "freeCashFlowPerShare",
  "freeCashFlowMargin",
  "grossMargin",
  "operatingMargin",
  "netMargin",
  "returnOnEquity",
  "returnOnAssets",
  "returnOnInvestedCapital",
  "cash",
  "totalDebt",
  "netDebt",
  "debtToEquity",
  "currentRatio",
  "interestCoverage",
  "sharesOutstanding",
  "shareGrowth",
  "dividendPerShare",
  "payoutRatio",
  "freeCashFlowPayoutRatio",
  "referencePrice",
] as const;

type HistoricalHeader = typeof historicalHeaders[number];

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function historicalFinancialsCsv(historical: HistoricalResearchData): string {
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
        `historicalValuationMethodVersion,${csvCell(historical.valuationMethodVersion)}`,
        valuationHeaders.join(","),
        ...valuationRows,
      ]
    : [];

  const valuationContext = historical.valuationContext;
  const valuationContextSection = valuationContext
    ? [
        "",
        "historicalValuationContext",
        "metric,value",
        ["methodVersion", valuationContext.methodVersion].map(csvCell).join(","),
        ["currentPriceEarnings", valuationContext.currentPriceEarnings].map(csvCell).join(","),
        ["currentPriceEarningsStatus", valuationContext.currentPriceEarningsStatus].map(csvCell).join(","),
        ["currentDividendYield", valuationContext.currentDividendYield].map(csvCell).join(","),
        ["currentTrailingDividendsPerShare", valuationContext.currentTrailingDividendsPerShare].map(csvCell).join(","),
        ["currentDividendPaymentCount", valuationContext.currentDividendPaymentCount].map(csvCell).join(","),
        ["currentPeVsReferenceMedian", valuationContext.currentPeVsReferenceMedian].map(csvCell).join(","),
        ["referenceWindow", valuationContext.referenceWindow].map(csvCell).join(","),
        ["referencePriceEarningsMedian", valuationContext.referencePriceEarningsMedian].map(csvCell).join(","),
        ["availableSince", valuationContext.availableSince].map(csvCell).join(","),
      ]
    : [];

  const coverage = historical.coverage;
  const coverageSection = coverage
    ? [
        "",
        "historicalCoverage",
        ["methodVersion", coverage.methodVersion].map(csvCell).join(","),
        "series,requestedYears,availableYears,observationCount,status,eventCoverageYears",
        ["financials", coverage.financials.requestedYears, coverage.financials.availableYears, coverage.financials.observationCount, coverage.financials.status, null].map(csvCell).join(","),
        ["price", coverage.price.requestedYears, coverage.price.availableYears, coverage.price.observationCount, coverage.price.status, null].map(csvCell).join(","),
        ["valuation", coverage.valuation.requestedYears, coverage.valuation.availableYears, coverage.valuation.observationCount, coverage.valuation.status, null].map(csvCell).join(","),
        ["dividend", coverage.dividend.requestedYears, coverage.dividend.availableYears, coverage.dividend.observationCount, coverage.dividend.status, coverage.dividend.eventCoverageYears].map(csvCell).join(","),
      ]
    : [];

  const priceContext = historical.priceContext;
  const priceContextSection = priceContext
    ? [
        "",
        "historicalPriceContext",
        "metric,value",
        ["currentPrice", priceContext.currentPrice].map(csvCell).join(","),
        ["currentPriceDate", priceContext.currentPriceDate].map(csvCell).join(","),
        ["yearHigh", priceContext.yearHigh].map(csvCell).join(","),
        ["yearLow", priceContext.yearLow].map(csvCell).join(","),
        ["distanceToYearHigh", priceContext.distanceToYearHigh].map(csvCell).join(","),
        ["distanceFromYearLow", priceContext.distanceFromYearLow].map(csvCell).join(","),
        ["yearRangeSource", priceContext.yearRangeSource].map(csvCell).join(","),
        "window,requestedYears,firstDate,lastDate,spanYears,sufficientHistory,observationCount,low,high,currentVsLow,currentVsHigh",
        ...(["oneYear", "threeYear", "fiveYear", "tenYear", "maximum"] as const).map((key) => {
          const window = priceContext[key];
          return [key, window.requestedYears, window.firstDate, window.lastDate, window.spanYears, window.sufficientHistory, window.observationCount, window.low, window.high, window.currentVsLow, window.currentVsHigh].map(csvCell).join(",");
        }),
      ]
    : [];

  const dividendContext = historical.dividendContext;
  const dividendContextSection = dividendContext
    ? [
        "",
        "historicalDividendContext",
        "metric,value",
        ["methodVersion", dividendContext.methodVersion].map(csvCell).join(","),
        ["status", dividendContext.status].map(csvCell).join(","),
        ["trailingDividendsPerShare", dividendContext.trailingDividendsPerShare].map(csvCell).join(","),
        ["currentDividendYield", dividendContext.currentDividendYield].map(csvCell).join(","),
        ["paymentCountTtm", dividendContext.paymentCountTtm].map(csvCell).join(","),
        ["paymentFrequency", dividendContext.paymentFrequency].map(csvCell).join(","),
        ["latestPaymentDate", dividendContext.latestPaymentDate].map(csvCell).join(","),
        ["latestPaymentAmount", dividendContext.latestPaymentAmount].map(csvCell).join(","),
        ["latestPaymentCurrency", dividendContext.latestPaymentCurrency].map(csvCell).join(","),
        ["increaseStreakYears", dividendContext.increaseStreakYears].map(csvCell).join(","),
        ["safety", dividendContext.safety].map(csvCell).join(","),
        ["annualHistoryYears", dividendContext.annualHistoryYears].map(csvCell).join(","),
        ["eventCoverageYears", dividendContext.eventCoverageYears].map(csvCell).join(","),
      ]
    : [];

  const quality = historical.discountQuality;
  const discountQualitySection = quality
    ? [
        "",
        "historicalDiscountQuality",
        ["methodVersion", csvCell(quality.methodVersion)].join(","),
        ["status", csvCell(quality.status)].join(","),
        ["classification", csvCell(quality.classification)].join(","),
        ["discountToReferenceMedian", csvCell(quality.discountToReferenceMedian)].join(","),
        ["referenceWindow", csvCell(quality.referenceWindow)].join(","),
        ["evidenceCoverage", csvCell(quality.coverage)].join(","),
        ["deteriorationScore", csvCell(quality.deteriorationScore)].join(","),
        ["evaluatedSignalCount", csvCell(quality.evaluatedSignalCount)].join(","),
        ["applicableSignalCount", csvCell(quality.applicableSignalCount)].join(","),
        ["summary", csvCell(quality.summary)].join(","),
        "signalKey,signalLabel,signalStatus,signalValue,signalWeight,signalDetail",
        ...quality.signals.map((signal) => [
          signal.key, signal.label, signal.status, signal.value, signal.weight, signal.detail,
        ].map(csvCell).join(",")),
      ]
    : [];
  return [
    historicalHeaders.join(","),
    ...rows,
    ...valuationSection,
    ...valuationContextSection,
    ...coverageSection,
    ...priceContextSection,
    ...dividendContextSection,
    ...discountQualitySection,
  ].join("\n");
}
