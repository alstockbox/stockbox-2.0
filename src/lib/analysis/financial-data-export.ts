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
  return [historicalHeaders.join(","), ...rows, ...valuationSection, ...discountQualitySection].join("\n");
}
