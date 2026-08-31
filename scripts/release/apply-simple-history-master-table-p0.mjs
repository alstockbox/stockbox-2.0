import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(path, before, after, label) {
  const source = readFileSync(path, "utf8");
  const first = source.indexOf(before);
  const last = source.lastIndexOf(before);
  if (first < 0 || first !== last) {
    throw new Error(`${label}: expected exactly one guarded match in ${path}`);
  }
  writeFileSync(path, source.replace(before, after));
}

replaceOnce(
  "tests/analysis/simple-history-master-table-p0.test.ts",
  "        epsDiluted: 1,",
  "        epsDiluted: 4,",
  "historical P/E fixture must satisfy price / TTM EPS = 5",
);

replaceOnce(
  "src/lib/analysis/types.ts",
  "  requestedYears: 3 | 5 | 10 | null;",
  "  requestedYears: 1 | 3 | 5 | 10 | null;",
  "valuation window year union",
);
replaceOnce(
  "src/lib/analysis/types.ts",
  "  availableSince: string | null;\n  threeYear: HistoricalValuationWindowStats;",
  "  availableSince: string | null;\n  oneYear?: HistoricalValuationWindowStats;\n  threeYear: HistoricalValuationWindowStats;",
  "one-year valuation context",
);
replaceOnce(
  "src/lib/analysis/types.ts",
  "  epsCagr10y: number | null;\n  dividendCagr3y: number | null;",
  "  epsCagr10y: number | null;\n  freeCashFlowGrowth1y?: number | null;\n  freeCashFlowCagr3y?: number | null;\n  freeCashFlowCagr5y?: number | null;\n  freeCashFlowCagr10y?: number | null;\n  dividendCagr3y: number | null;",
  "historical FCF growth fields",
);

replaceOnce(
  "src/lib/analysis/historical-valuation.ts",
  "  years: 3 | 5 | 10,",
  "  years: 1 | 3 | 5 | 10,",
  "generic valuation window years",
);
replaceOnce(
  "src/lib/analysis/historical-valuation.ts",
  "  const threeYear = statsForWindow(series, 3);",
  "  const oneYear = statsForWindow(series, 1);\n  const threeYear = statsForWindow(series, 3);",
  "build one-year valuation stats",
);
replaceOnce(
  "src/lib/analysis/historical-valuation.ts",
  "    availableSince: maximum.firstDate,\n    threeYear,",
  "    availableSince: maximum.firstDate,\n    oneYear,\n    threeYear,",
  "return one-year valuation stats",
);

replaceOnce(
  "src/lib/analysis/historical.ts",
  `function cagrForYears(\n  points: HistoricalFinancialPoint[],\n  years: number,\n  selector: (point: HistoricalFinancialPoint) => number | null,\n): number | null {\n  const latest = points.at(-1);\n  if (!latest) return null;\n  const prior = points.find((point) => point.fiscalYear === latest.fiscalYear - years);\n  if (!prior) return null;\n  return calculateCagr(selector(prior), selector(latest), years);\n}\n`,
  `function cagrForYears(\n  points: HistoricalFinancialPoint[],\n  years: number,\n  selector: (point: HistoricalFinancialPoint) => number | null,\n): number | null {\n  const latest = points.at(-1);\n  if (!latest) return null;\n  const prior = points.find((point) => point.fiscalYear === latest.fiscalYear - years);\n  if (!prior) return null;\n  return calculateCagr(selector(prior), selector(latest), years);\n}\n\nfunction growthForYears(\n  points: HistoricalFinancialPoint[],\n  years: number,\n  selector: (point: HistoricalFinancialPoint) => number | null,\n): number | null {\n  const latest = points.at(-1);\n  if (!latest) return null;\n  const prior = points.find((point) => point.fiscalYear === latest.fiscalYear - years);\n  if (!prior) return null;\n  return calculateGrowth(selector(latest), selector(prior));\n}\n`,
  "historical growth helper",
);
replaceOnce(
  "src/lib/analysis/historical.ts",
  "    epsCagr10y: cagrForYears(points, 10, (point) => point.eps),\n    dividendCagr3y:",
  "    epsCagr10y: cagrForYears(points, 10, (point) => point.eps),\n    freeCashFlowGrowth1y: growthForYears(points, 1, (point) => point.freeCashFlow),\n    freeCashFlowCagr3y: cagrForYears(points, 3, (point) => point.freeCashFlow),\n    freeCashFlowCagr5y: cagrForYears(points, 5, (point) => point.freeCashFlow),\n    freeCashFlowCagr10y: cagrForYears(points, 10, (point) => point.freeCashFlow),\n    dividendCagr3y:",
  "return historical FCF growth metrics",
);

replaceOnce(
  "src/components/analysis/historical-research.tsx",
  "  HistoricalValuationPoint,\n  UiMode,",
  "  HistoricalValuationPoint,\n  HistoricalValuationWindowStats,\n  UiMode,",
  "historical snapshot valuation type import",
);
replaceOnce(
  "src/components/analysis/historical-research.tsx",
  "    signalEvidence: \"Deterministiska signaler\",\n    years:",
  "    signalEvidence: \"Deterministiska signaler\", historicalSnapshot: \"Historisk översikt\",\n    currentColumn: \"Nu\", oneYearColumn: \"1 år\", threeYearColumn: \"3 år\", fiveYearColumn: \"5 år\", tenYearColumn: \"10 år\", maxColumn: \"MAX\",\n    dividendGrowth: \"Utdelningstillväxt\", snapshotNote: \"Nu visar senaste nivå där det är relevant. Horisonter visar tillväxt eller historisk median/snitt. MAX använder längsta verifierade historik och märker aldrig kortare historik som 10 år.\",\n    years:",
  "Swedish historical snapshot copy",
);
replaceOnce(
  "src/components/analysis/historical-research.tsx",
  "    signalEvidence: \"Deterministic signals\",\n    years:",
  "    signalEvidence: \"Deterministic signals\", historicalSnapshot: \"Historical snapshot\",\n    currentColumn: \"Current\", oneYearColumn: \"1Y\", threeYearColumn: \"3Y\", fiveYearColumn: \"5Y\", tenYearColumn: \"10Y\", maxColumn: \"MAX\",\n    dividendGrowth: \"Dividend growth\", snapshotNote: \"Current shows the latest level where applicable. Horizon columns show growth or historical median/average context. MAX uses the longest verified history and never relabels shorter history as 10Y.\",\n    years:",
  "English historical snapshot copy",
);

const snapshotComponent = `function latestFinancial(points: HistoricalFinancialPoint[]) {\n  return points.at(-1) ?? null;\n}\n\nfunction valuationWindowValue(\n  window: HistoricalValuationWindowStats | undefined,\n  selector: (value: HistoricalValuationWindowStats) => number | null,\n  formatter: (value: number | null) => string,\n  insufficientHistory: string,\n) {\n  if (!window?.sufficientHistory) return insufficientHistory;\n  return formatter(selector(window));\n}\n\nfunction longestGrowthValue(\n  values: Array<{ label: string; value: number | null | undefined }>,\n  locale: Locale,\n  unavailable: string,\n  insufficientHistory: string,\n) {\n  const match = values.find((item) => isNumber(item.value));\n  return match ? match.label + \" \" + formatPercent(match.value ?? null, locale, unavailable) : insufficientHistory;\n}\n\nfunction HistoricalSnapshot({ report, locale }: { report: AnalysisReport; locale: Locale }) {\n  const historical = report.historical;\n  if (!historical) return null;\n  const copy = copyFor(locale);\n  const extra = extraCopyFor(locale);\n  const latest = latestFinancial(historical.financials);\n  const valuation = historical.valuationContext;\n  const currency = latest?.currency ?? report.reportingCurrency;\n  const percent = (value: number | null | undefined) => formatPercent(value ?? null, locale, copy.unavailable);\n  const multiple = (value: number | null | undefined) => isNumber(value) ? formatNumber(value, locale, copy.unavailable, 1) + \"×\" : copy.unavailable;\n  const longest = (ten: number | null | undefined, five: number | null | undefined, three: number | null | undefined, one: number | null | undefined) =>\n    longestGrowthValue([\n      { label: \"10Y\", value: ten },\n      { label: \"5Y\", value: five },\n      { label: \"3Y\", value: three },\n      { label: \"1Y\", value: one },\n    ], locale, copy.unavailable, extra.insufficientHistory);\n  const windowPe = (window: HistoricalValuationWindowStats | undefined) =>\n    valuationWindowValue(window, (value) => value.priceEarningsMedian, (value) => multiple(value), extra.insufficientHistory);\n  const windowYield = (window: HistoricalValuationWindowStats | undefined) =>\n    valuationWindowValue(window, (value) => value.dividendYieldAverage, (value) => percent(value), extra.insufficientHistory);\n\n  const rows = [\n    {\n      key: \"pe\", label: \"P/E\",\n      values: [\n        multiple(valuation?.currentPriceEarnings),\n        windowPe(valuation?.oneYear),\n        windowPe(valuation?.threeYear),\n        windowPe(valuation?.fiveYear),\n        windowPe(valuation?.tenYear),\n        windowPe(valuation?.maximum),\n      ],\n    },\n    {\n      key: \"yield\", label: extra.dividendYield,\n      values: [\n        percent(valuation?.currentDividendYield),\n        windowYield(valuation?.oneYear),\n        windowYield(valuation?.threeYear),\n        windowYield(valuation?.fiveYear),\n        windowYield(valuation?.tenYear),\n        windowYield(valuation?.maximum),\n      ],\n    },\n    {\n      key: \"dividend-growth\", label: extra.dividendGrowth,\n      values: [\n        formatMoney(latest?.dividendPerShare ?? null, currency, locale, copy.unavailable, false),\n        percent(latest?.dividendGrowth),\n        percent(historical.dividendCagr3y),\n        percent(historical.dividendCagr5y),\n        isNumber(historical.dividendCagr10y) ? percent(historical.dividendCagr10y) : extra.insufficientHistory,\n        longest(historical.dividendCagr10y, historical.dividendCagr5y, historical.dividendCagr3y, latest?.dividendGrowth),\n      ],\n    },\n    {\n      key: \"revenue\", label: copy.revenue,\n      values: [\n        formatMoney(latest?.revenue ?? null, currency, locale, copy.unavailable),\n        percent(latest?.revenueGrowth),\n        percent(historical.revenueCagr3y),\n        percent(historical.revenueCagr5y),\n        isNumber(historical.revenueCagr10y) ? percent(historical.revenueCagr10y) : extra.insufficientHistory,\n        longest(historical.revenueCagr10y, historical.revenueCagr5y, historical.revenueCagr3y, latest?.revenueGrowth),\n      ],\n    },\n    {\n      key: \"eps\", label: copy.eps,\n      values: [\n        formatNumber(latest?.eps ?? null, locale, copy.unavailable),\n        percent(latest?.epsGrowth),\n        percent(historical.epsCagr3y),\n        percent(historical.epsCagr5y),\n        isNumber(historical.epsCagr10y) ? percent(historical.epsCagr10y) : extra.insufficientHistory,\n        longest(historical.epsCagr10y, historical.epsCagr5y, historical.epsCagr3y, latest?.epsGrowth),\n      ],\n    },\n    {\n      key: \"fcf\", label: copy.fcf,\n      values: [\n        formatMoney(latest?.freeCashFlow ?? null, currency, locale, copy.unavailable),\n        percent(historical.freeCashFlowGrowth1y),\n        percent(historical.freeCashFlowCagr3y),\n        percent(historical.freeCashFlowCagr5y),\n        isNumber(historical.freeCashFlowCagr10y) ? percent(historical.freeCashFlowCagr10y) : extra.insufficientHistory,\n        longest(historical.freeCashFlowCagr10y, historical.freeCashFlowCagr5y, historical.freeCashFlowCagr3y, historical.freeCashFlowGrowth1y),\n      ],\n    },\n  ];\n\n  return (\n    <Card className=\"border-[#b99b5f]/25 bg-[#b99b5f]/[0.035]\">\n      <div className=\"flex flex-wrap items-center justify-between gap-2\">\n        <h2 className=\"text-lg font-semibold text-[#f4efe5]\">{extra.historicalSnapshot}</h2>\n        <Badge>{historical.financials.length} {extra.years}</Badge>\n      </div>\n      <p className=\"mt-2 text-xs leading-5 text-[#9aa7b8]\">{extra.snapshotNote}</p>\n      <TableShell>\n        <thead><tr>\n          {[copy.metric, extra.currentColumn, extra.oneYearColumn, extra.threeYearColumn, extra.fiveYearColumn, extra.tenYearColumn, extra.maxColumn].map((label) => (\n            <th key={label} className={headClass}>{label}</th>\n          ))}\n        </tr></thead>\n        <tbody>{rows.map((row) => (\n          <tr key={row.key}>\n            <td className={cellClass + \" font-semibold text-[#f4efe5]\"}>{row.label}</td>\n            {row.values.map((value, index) => <td key={index} className={cellClass}>{value}</td>)}\n          </tr>\n        ))}</tbody>\n      </TableShell>\n    </Card>\n  );\n}\n`;

replaceOnce(
  "src/components/analysis/historical-research.tsx",
  `function latestFinancial(points: HistoricalFinancialPoint[]) {\n  return points.at(-1) ?? null;\n}\n`,
  snapshotComponent,
  "insert Simple historical snapshot component",
);
replaceOnce(
  "src/components/analysis/historical-research.tsx",
  "      {dividendProfile ? <DividendSnapshot report={report} locale={locale} /> : null}\n      <HistoricalOverview report={report} locale={locale} />",
  "      {dividendProfile ? <DividendSnapshot report={report} locale={locale} /> : null}\n      {mode === \"simple\" ? <HistoricalSnapshot report={report} locale={locale} /> : null}\n      <HistoricalOverview report={report} locale={locale} />",
  "render Simple historical snapshot",
);

console.log("Simple historical master-table P0 patch applied with all guards satisfied.");
