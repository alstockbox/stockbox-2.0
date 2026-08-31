import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(path, before, after, label) {
  const source = readFileSync(path, "utf8");
  const first = source.indexOf(before);
  const last = source.lastIndexOf(before);
  if (first < 0 || first !== last) throw new Error(`${label}: expected exactly one guarded match in ${path}`);
  writeFileSync(path, source.replace(before, after));
}

replaceOnce(
  "src/lib/analysis/types.ts",
  `export type HistoricalResearchData = {\n  financials: HistoricalFinancialPoint[];`,
  `export type HistoricalPriceWindowStats = {\n  requestedYears: 1 | 3 | 5 | 10 | null;\n  firstDate: string | null;\n  lastDate: string | null;\n  spanYears: number;\n  sufficientHistory: boolean;\n  observationCount: number;\n  low: number | null;\n  high: number | null;\n  currentVsLow: number | null;\n  currentVsHigh: number | null;\n};\n\nexport type HistoricalPriceContext = {\n  currentPrice: number | null;\n  currentPriceDate: string | null;\n  yearHigh: number | null;\n  yearLow: number | null;\n  distanceToYearHigh: number | null;\n  distanceFromYearLow: number | null;\n  yearRangeSource: \"provider\" | \"price_history\" | null;\n  oneYear: HistoricalPriceWindowStats;\n  threeYear: HistoricalPriceWindowStats;\n  fiveYear: HistoricalPriceWindowStats;\n  tenYear: HistoricalPriceWindowStats;\n  maximum: HistoricalPriceWindowStats;\n};\n\nexport type HistoricalResearchData = {\n  financials: HistoricalFinancialPoint[];`,
  "historical price context types",
);
replaceOnce(
  "src/lib/analysis/types.ts",
  `  price: MarketPricePoint[];\n  valuation?: HistoricalValuationPoint[];`,
  `  price: MarketPricePoint[];\n  priceContext?: HistoricalPriceContext;\n  valuation?: HistoricalValuationPoint[];`,
  "historical research priceContext field",
);

replaceOnce(
  "src/lib/analysis/historical.ts",
  `  HistoricalResearchData,\n  HistoricalTtmEpsPoint,`,
  `  HistoricalPriceContext,\n  HistoricalPriceWindowStats,\n  HistoricalResearchData,\n  HistoricalTtmEpsPoint,`,
  "historical price-context type imports",
);

const helpers = `function dividendStreakStats(points: HistoricalFinancialPoint[]) {\n`;
const helperReplacement = `function parsedPriceDate(value: string | null | undefined): number | null {\n  if (!value) return null;\n  const time = Date.parse(value.includes(\"T\") ? value : value + \"T00:00:00Z\");\n  return Number.isFinite(time) ? time : null;\n}\n\nfunction priceSpanYears(firstDate: string | null, lastDate: string | null): number {\n  const first = parsedPriceDate(firstDate);\n  const last = parsedPriceDate(lastDate);\n  if (first === null || last === null || last < first) return 0;\n  return (last - first) / (365.2425 * 86_400_000);\n}\n\nfunction historicalPriceWindow(\n  prices: MarketPricePoint[],\n  currentPrice: number | null,\n  endDate: string | null,\n  years: 1 | 3 | 5 | 10 | null,\n): HistoricalPriceWindowStats {\n  const endMs = parsedPriceDate(endDate) ?? parsedPriceDate(prices.at(-1)?.date);\n  const startMs = endMs !== null && years !== null\n    ? (() => {\n        const date = new Date(endMs);\n        date.setUTCFullYear(date.getUTCFullYear() - years);\n        return date.getTime();\n      })()\n    : null;\n  const selected = prices.filter((point) => {\n    const time = parsedPriceDate(point.date);\n    if (time === null || !isFiniteNumber(point.close) || point.close <= 0) return false;\n    if (endMs !== null && time > endMs) return false;\n    return startMs === null || time >= startMs;\n  });\n  const values = selected.map((point) => point.close);\n  const firstDate = selected.at(0)?.date ?? null;\n  const lastDate = selected.at(-1)?.date ?? null;\n  const spanYears = priceSpanYears(firstDate, lastDate);\n  const minimumObservations = years === null ? 2 : Math.max(3, years * 2);\n  const sufficientHistory = years === null\n    ? selected.length >= minimumObservations\n    : spanYears >= years - 0.1 && selected.length >= minimumObservations;\n  const low = values.length ? Math.min(...values) : null;\n  const high = values.length ? Math.max(...values) : null;\n  return {\n    requestedYears: years,\n    firstDate,\n    lastDate,\n    spanYears,\n    sufficientHistory,\n    observationCount: selected.length,\n    low,\n    high,\n    currentVsLow: currentPrice !== null && low !== null ? currentPrice / low - 1 : null,\n    currentVsHigh: currentPrice !== null && high !== null ? currentPrice / high - 1 : null,\n  };\n}\n\nfunction buildHistoricalPriceContext(\n  prices: MarketPricePoint[],\n  options: HistoricalResearchOptions,\n): HistoricalPriceContext {\n  const latestPrice = prices.at(-1) ?? null;\n  const currentPrice = positive(options.currentPrice) ?? positive(latestPrice?.close);\n  const currentPriceDate = parsedPriceDate(options.currentPriceDate) !== null\n    ? options.currentPriceDate ?? null\n    : latestPrice?.date ?? null;\n  const oneYear = historicalPriceWindow(prices, currentPrice, currentPriceDate, 1);\n  const threeYear = historicalPriceWindow(prices, currentPrice, currentPriceDate, 3);\n  const fiveYear = historicalPriceWindow(prices, currentPrice, currentPriceDate, 5);\n  const tenYear = historicalPriceWindow(prices, currentPrice, currentPriceDate, 10);\n  const maximum = historicalPriceWindow(prices, currentPrice, currentPriceDate, null);\n  const providerHigh = positive(options.yearHigh);\n  const providerLow = positive(options.yearLow);\n  const useProviderRange = providerHigh !== null && providerLow !== null && providerHigh >= providerLow;\n  const useHistoryRange = !useProviderRange && oneYear.sufficientHistory && oneYear.high !== null && oneYear.low !== null;\n  const yearHigh = useProviderRange ? providerHigh : useHistoryRange ? oneYear.high : null;\n  const yearLow = useProviderRange ? providerLow : useHistoryRange ? oneYear.low : null;\n  return {\n    currentPrice,\n    currentPriceDate,\n    yearHigh,\n    yearLow,\n    distanceToYearHigh: currentPrice !== null && yearHigh !== null ? currentPrice / yearHigh - 1 : null,\n    distanceFromYearLow: currentPrice !== null && yearLow !== null ? currentPrice / yearLow - 1 : null,\n    yearRangeSource: useProviderRange ? \"provider\" : useHistoryRange ? \"price_history\" : null,\n    oneYear,\n    threeYear,\n    fiveYear,\n    tenYear,\n    maximum,\n  };\n}\n\nfunction dividendStreakStats(points: HistoricalFinancialPoint[]) {\n`;
replaceOnce("src/lib/analysis/historical.ts", helpers, helperReplacement, "historical price context helpers");

replaceOnce(
  "src/lib/analysis/historical.ts",
  `  currentPriceEarnings?: number | null;\n};`,
  `  currentPriceEarnings?: number | null;\n  currentPrice?: number | null;\n  currentPriceDate?: string | null;\n  yearHigh?: number | null;\n  yearLow?: number | null;\n};`,
  "historical price options",
);
replaceOnce(
  "src/lib/analysis/historical.ts",
  `  const dividendStats = dividendStreakStats(points);\n  const valuation = buildHistoricalValuationSeries({`,
  `  const dividendStats = dividendStreakStats(points);\n  const priceContext = buildHistoricalPriceContext(sortedPrices, options);\n  const valuation = buildHistoricalValuationSeries({`,
  "build historical price context",
);
replaceOnce(
  "src/lib/analysis/historical.ts",
  `    price: sortedPrices,\n    valuation,`,
  `    price: sortedPrices,\n    priceContext,\n    valuation,`,
  "return historical price context",
);

replaceOnce(
  "src/lib/analysis/engine.ts",
  `        dividendEvents: legacyInput.market?.dividendEvents,\n        currentPriceEarnings: result.metrics.valuation.priceEarnings,`,
  `        dividendEvents: legacyInput.market?.dividendEvents,\n        currentPriceEarnings: result.metrics.valuation.priceEarnings,\n        currentPrice: legacyInput.market?.price,\n        currentPriceDate: legacyInput.market?.date,\n        yearHigh: legacyInput.market?.yearHigh,\n        yearLow: legacyInput.market?.yearLow,`,
  "engine price-context wiring",
);

replaceOnce(
  "src/components/analysis/historical-research.tsx",
  `    dividendGrowth: \"Utdelningstillväxt\", snapshotNote: \"Nu visar senaste nivå där det är relevant. Horisonter visar tillväxt eller historisk median/snitt. MAX använder längsta verifierade historik och märker aldrig kortare historik som 10 år.\",\n    years:`,
  `    dividendGrowth: \"Utdelningstillväxt\", snapshotNote: \"Nu visar senaste nivå där det är relevant. Horisonter visar tillväxt eller historisk median/snitt. MAX använder längsta verifierade historik och märker aldrig kortare historik som 10 år.\",\n    priceContext: \"Priskontext\", currentPrice: \"Aktuell kurs\", yearHigh: \"52V högsta\", yearLow: \"52V lägsta\",\n    threeYearRange: \"3 år intervall\", fiveYearRange: \"5 år intervall\", tenYearRange: \"10 år intervall\", maxRange: \"MAX intervall\",\n    below: \"under\", above: \"över\", priceContextNote: \"52-veckorsintervallet använder providerdata när den är komplett, annars verifierad 1-årshistorik. Flerårsintervall visas bara när faktisk tidsbredd är tillräcklig.\",\n    years:`,
  "Swedish price-context copy",
);
replaceOnce(
  "src/components/analysis/historical-research.tsx",
  `    dividendGrowth: \"Dividend growth\", snapshotNote: \"Current shows the latest level where applicable. Horizon columns show growth or historical median/average context. MAX uses the longest verified history and never relabels shorter history as 10Y.\",\n    years:`,
  `    dividendGrowth: \"Dividend growth\", snapshotNote: \"Current shows the latest level where applicable. Horizon columns show growth or historical median/average context. MAX uses the longest verified history and never relabels shorter history as 10Y.\",\n    priceContext: \"Price context\", currentPrice: \"Current price\", yearHigh: \"52W high\", yearLow: \"52W low\",\n    threeYearRange: \"3Y range\", fiveYearRange: \"5Y range\", tenYearRange: \"10Y range\", maxRange: \"MAX range\",\n    below: \"below\", above: \"above\", priceContextNote: \"The 52-week range uses provider data when complete, otherwise verified one-year price history. Multi-year ranges are shown only when actual time coverage is sufficient.\",\n    years:`,
  "English price-context copy",
);

const componentAnchor = `function HistoricalSnapshot({ report, locale }: { report: AnalysisReport; locale: Locale }) {\n`;
const priceComponent = `function PriceContextCard({ report, locale }: { report: AnalysisReport; locale: Locale }) {\n  const context = report.historical?.priceContext;\n  if (!context) return null;\n  const copy = copyFor(locale);\n  const extra = extraCopyFor(locale);\n  const currency = report.market?.currency ?? report.reportingCurrency;\n  const money = (value: number | null) => formatMoney(value, currency, locale, copy.unavailable, false);\n  const relation = (value: number | null, direction: \"high\" | \"low\") => {\n    if (!isNumber(value)) return copy.unavailable;\n    const magnitude = formatPercent(Math.abs(value), locale, copy.unavailable);\n    if (direction === \"high\") return value <= 0 ? magnitude + \" \" + extra.below : magnitude + \" \" + extra.above;\n    return value >= 0 ? magnitude + \" \" + extra.above : magnitude + \" \" + extra.below;\n  };\n  const range = (window: typeof context.oneYear) =>\n    window.sufficientHistory && isNumber(window.low) && isNumber(window.high)\n      ? money(window.low) + \" – \" + money(window.high)\n      : extra.insufficientHistory;\n  return (\n    <Card>\n      <div className=\"flex flex-wrap items-center justify-between gap-2\">\n        <h2 className=\"text-lg font-semibold text-[#f4efe5]\">{extra.priceContext}</h2>\n        {context.currentPriceDate ? <Badge>{context.currentPriceDate}</Badge> : null}\n      </div>\n      <p className=\"mt-2 text-xs leading-5 text-[#9aa7b8]\">{extra.priceContextNote}</p>\n      <div className=\"mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3\">\n        <Stat label={extra.currentPrice} value={money(context.currentPrice)} />\n        <Stat label={extra.yearHigh} value={context.yearHigh === null ? copy.unavailable : money(context.yearHigh) + \" · \" + relation(context.distanceToYearHigh, \"high\")} />\n        <Stat label={extra.yearLow} value={context.yearLow === null ? copy.unavailable : money(context.yearLow) + \" · \" + relation(context.distanceFromYearLow, \"low\")} />\n        <Stat label={extra.threeYearRange} value={range(context.threeYear)} />\n        <Stat label={extra.fiveYearRange} value={range(context.fiveYear)} />\n        <Stat label={extra.tenYearRange} value={range(context.tenYear)} />\n        <Stat label={extra.maxRange} value={range(context.maximum)} />\n      </div>\n    </Card>\n  );\n}\n\nfunction HistoricalSnapshot({ report, locale }: { report: AnalysisReport; locale: Locale }) {\n`;
replaceOnce(
  "src/components/analysis/historical-research.tsx",
  componentAnchor,
  priceComponent,
  "insert price context card",
);
replaceOnce(
  "src/components/analysis/historical-research.tsx",
  `      {dividendProfile ? <DividendSnapshot report={report} locale={locale} /> : null}\n      {mode === \"simple\" ? <HistoricalSnapshot report={report} locale={locale} /> : null}`,
  `      {dividendProfile ? <DividendSnapshot report={report} locale={locale} /> : null}\n      {mode === \"simple\" ? <PriceContextCard report={report} locale={locale} /> : null}\n      {mode === \"simple\" ? <HistoricalSnapshot report={report} locale={locale} /> : null}`,
  "render price context in Simple Mode",
);

console.log("Historical price context P0 patch applied with all guards satisfied.");
