from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"guard failed for {path}: expected 1 match, found {count}")
    p.write_text(text.replace(old, new, 1))


replace_once(
    "src/lib/analysis/types.ts",
    '''export type HistoricalValuationContext = {\n  methodVersion: string;\n  currentPriceEarnings: number | null;\n  currentDividendYield: number | null;''',
    '''export type HistoricalValuationContext = {\n  methodVersion: string;\n  currentPriceEarnings: number | null;\n  currentPriceEarningsStatus: "available" | "not_meaningful" | "unavailable";\n  currentDividendYield: number | null;''',
)

replace_once(
    "src/lib/analysis/types.ts",
    '''export type HistoricalResearchData = {\n  financials: HistoricalFinancialPoint[];''',
    '''export type HistoricalCoverageStatus = "full" | "partial" | "unavailable" | "not_applicable";\n\nexport type HistoricalCoverageItem = {\n  requestedYears: 10;\n  availableYears: number;\n  observationCount: number;\n  status: HistoricalCoverageStatus;\n};\n\nexport type HistoricalCoverageContext = {\n  methodVersion: string;\n  financials: HistoricalCoverageItem;\n  price: HistoricalCoverageItem;\n  valuation: HistoricalCoverageItem;\n  dividend: HistoricalCoverageItem & { eventCoverageYears?: number };\n};\n\nexport type HistoricalResearchData = {\n  financials: HistoricalFinancialPoint[];''',
)

replace_once(
    "src/lib/analysis/types.ts",
    '''  priceContext?: HistoricalPriceContext;\n  dividendContext?: DividendResearchContext;\n  valuation?: HistoricalValuationPoint[];''',
    '''  priceContext?: HistoricalPriceContext;\n  dividendContext?: DividendResearchContext;\n  coverage?: HistoricalCoverageContext;\n  valuation?: HistoricalValuationPoint[];''',
)

replace_once(
    "src/lib/analysis/historical-valuation.ts",
    '''  const currentPriceEarnings = positive(input.currentPriceEarnings) ? input.currentPriceEarnings : null;\n  const referenceMedian = positive(comparison.priceEarningsMedian) ? comparison.priceEarningsMedian : null;''',
    '''  const currentPriceEarnings = positive(input.currentPriceEarnings) ? input.currentPriceEarnings : null;\n  const currentPriceEarningsStatus: HistoricalValuationContext["currentPriceEarningsStatus"] = currentPriceEarnings !== null\n    ? "available"\n    : series.at(-1)?.priceEarningsStatus === "not_meaningful"\n      ? "not_meaningful"\n      : "unavailable";\n  const referenceMedian = positive(comparison.priceEarningsMedian) ? comparison.priceEarningsMedian : null;''',
)

replace_once(
    "src/lib/analysis/historical-valuation.ts",
    '''    methodVersion: HISTORICAL_VALUATION_METHOD_VERSION,\n    currentPriceEarnings,\n    currentDividendYield,''',
    '''    methodVersion: HISTORICAL_VALUATION_METHOD_VERSION,\n    currentPriceEarnings,\n    currentPriceEarningsStatus,\n    currentDividendYield,''',
)

replace_once(
    "src/lib/analysis/historical.ts",
    '''  DividendResearchContext,\n  FinancialPeriod,\n  HistoricalFinancialPoint,''',
    '''  DividendResearchContext,\n  FinancialPeriod,\n  HistoricalCoverageContext,\n  HistoricalFinancialPoint,''',
)

replace_once(
    "src/lib/analysis/historical.ts",
    '''  HistoricalResearchData,\n  HistoricalTtmEpsPoint,''',
    '''  HistoricalResearchData,\n  HistoricalTtmEpsPoint,\n  HistoricalValuationContext,''',
)

replace_once(
    "src/lib/analysis/historical.ts",
    '''export const DIVIDEND_CONTEXT_METHOD_VERSION = "dividend-context-v1";''',
    '''export const DIVIDEND_CONTEXT_METHOD_VERSION = "dividend-context-v1";\nexport const HISTORICAL_COVERAGE_METHOD_VERSION = "historical-coverage-v1";\nconst HISTORICAL_COVERAGE_REQUESTED_YEARS = 10 as const;''',
)

replace_once(
    "src/lib/analysis/historical.ts",
    '''function dividendStreakStats(points: HistoricalFinancialPoint[]) {''',
    '''function buildHistoricalCoverageContext(\n  points: HistoricalFinancialPoint[],\n  priceContext: HistoricalPriceContext,\n  valuationContext: HistoricalValuationContext,\n  dividendContext: DividendResearchContext,\n): HistoricalCoverageContext {\n  const financialObservationCount = new Set(points.map((point) => point.fiscalYear)).size;\n  const financialAvailableYears = Math.min(HISTORICAL_COVERAGE_REQUESTED_YEARS, financialObservationCount);\n  const financialStatus = financialObservationCount === 0\n    ? "unavailable" as const\n    : financialAvailableYears >= HISTORICAL_COVERAGE_REQUESTED_YEARS\n      ? "full" as const\n      : "partial" as const;\n\n  const priceObservationCount = priceContext.maximum.observationCount;\n  const priceAvailableYears = Math.min(HISTORICAL_COVERAGE_REQUESTED_YEARS, Math.max(0, priceContext.maximum.spanYears));\n  const priceStatus = priceObservationCount === 0\n    ? "unavailable" as const\n    : priceContext.tenYear.sufficientHistory\n      ? "full" as const\n      : "partial" as const;\n\n  const valuationObservationCount = valuationContext.maximum.observationCount;\n  const valuationAvailableYears = Math.min(HISTORICAL_COVERAGE_REQUESTED_YEARS, Math.max(0, valuationContext.maximum.spanYears));\n  const valuationStatus = valuationObservationCount === 0\n    ? "unavailable" as const\n    : valuationContext.tenYear.sufficientHistory\n      ? "full" as const\n      : "partial" as const;\n\n  const dividendAvailableYears = Math.min(HISTORICAL_COVERAGE_REQUESTED_YEARS, dividendContext.annualHistoryYears);\n  const dividendStatus = dividendContext.status === "nonpayer"\n    ? "not_applicable" as const\n    : dividendContext.annualHistoryYears === 0 && dividendContext.eventCoverageYears === 0\n      ? "unavailable" as const\n      : dividendAvailableYears >= HISTORICAL_COVERAGE_REQUESTED_YEARS && dividendContext.eventCoverageYears >= 9.5\n        ? "full" as const\n        : "partial" as const;\n\n  return {\n    methodVersion: HISTORICAL_COVERAGE_METHOD_VERSION,\n    financials: {\n      requestedYears: HISTORICAL_COVERAGE_REQUESTED_YEARS,\n      availableYears: financialAvailableYears,\n      observationCount: financialObservationCount,\n      status: financialStatus,\n    },\n    price: {\n      requestedYears: HISTORICAL_COVERAGE_REQUESTED_YEARS,\n      availableYears: priceAvailableYears,\n      observationCount: priceObservationCount,\n      status: priceStatus,\n    },\n    valuation: {\n      requestedYears: HISTORICAL_COVERAGE_REQUESTED_YEARS,\n      availableYears: valuationAvailableYears,\n      observationCount: valuationObservationCount,\n      status: valuationStatus,\n    },\n    dividend: {\n      requestedYears: HISTORICAL_COVERAGE_REQUESTED_YEARS,\n      availableYears: dividendAvailableYears,\n      observationCount: dividendContext.annualHistoryYears,\n      status: dividendStatus,\n      eventCoverageYears: dividendContext.eventCoverageYears,\n    },\n  };\n}\n\nfunction dividendStreakStats(points: HistoricalFinancialPoint[]) {''',
)

replace_once(
    "src/lib/analysis/historical.ts",
    '''  const valuationContext = buildHistoricalValuationContext({\n    series: valuation,\n    currentPriceEarnings: options.currentPriceEarnings,\n    prices: sortedPrices,\n    dividendEvents: options.dividendEvents,\n  });\n\n  return {''',
    '''  const valuationContext = buildHistoricalValuationContext({\n    series: valuation,\n    currentPriceEarnings: options.currentPriceEarnings,\n    prices: sortedPrices,\n    dividendEvents: options.dividendEvents,\n  });\n  const coverage = buildHistoricalCoverageContext(points, priceContext, valuationContext, dividendContext);\n\n  return {''',
)

replace_once(
    "src/lib/analysis/historical.ts",
    '''    priceContext,\n    dividendContext,\n    valuation,''',
    '''    priceContext,\n    dividendContext,\n    coverage,\n    valuation,''',
)

replace_once(
    "src/components/analysis/historical-research.tsx",
    '''  AnalysisReport,\n  HistoricalFinancialPoint,\n  HistoricalValuationPoint,''',
    '''  AnalysisReport,\n  HistoricalCoverageItem,\n  HistoricalFinancialPoint,\n  HistoricalValuationPoint,''',
)

replace_once(
    "src/components/analysis/historical-research.tsx",
    '''    paymentFrequency: "Betalningsfrekvens", latestPayment: "Senaste betalning", increaseStreak: "Höjningssvit", dividendSafety: "Utdelningssäkerhet", coverage: "Täckning",\n    monthly: "Månadsvis", quarterly: "Kvartalsvis", semiannual: "Halvårsvis", annual: "Årlig", irregular: "Oregelbunden", none: "Ingen", unknown: "Okänd",\n    covered: "Täckt", stretched: "Ansträngd", notCovered: "Ej täckt", insufficient: "Otillräckligt underlag", events: "event",''',
    '''    paymentFrequency: "Betalningsfrekvens", latestPayment: "Senaste betalning", increaseStreak: "Höjningssvit", dividendSafety: "Utdelningssäkerhet", coverage: "Täckning",\n    monthly: "Månadsvis", quarterly: "Kvartalsvis", semiannual: "Halvårsvis", annual: "Årlig", irregular: "Oregelbunden", none: "Ingen", unknown: "Okänd",\n    covered: "Täckt", stretched: "Ansträngd", notCovered: "Ej täckt", insufficient: "Otillräckligt underlag", events: "event",\n    historicalCoverage: "Historisk täckning", financialsCoverage: "Finansiell historik", priceCoverage: "Prishistorik", valuationCoverage: "Värderingshistorik", dividendCoverage: "Utdelningshistorik",\n    coverageSeparate: "Täckning är separat från modellens konfidens", fullCoverage: "Full täckning", partialCoverage: "Otillräcklig historik", unavailableCoverage: "Saknas", notApplicableCoverage: "Ej tillämpligt", nmNegativeEarnings: "N/M — negativt resultat", observations: "observationer",''',
)

replace_once(
    "src/components/analysis/historical-research.tsx",
    '''    paymentFrequency: "Payment frequency", latestPayment: "Latest payment", increaseStreak: "Increase streak", dividendSafety: "Dividend safety", coverage: "Coverage",\n    monthly: "Monthly", quarterly: "Quarterly", semiannual: "Semiannual", annual: "Annual", irregular: "Irregular", none: "None", unknown: "Unknown",\n    covered: "Covered", stretched: "Stretched", notCovered: "Not covered", insufficient: "Insufficient data", events: "events",''',
    '''    paymentFrequency: "Payment frequency", latestPayment: "Latest payment", increaseStreak: "Increase streak", dividendSafety: "Dividend safety", coverage: "Coverage",\n    monthly: "Monthly", quarterly: "Quarterly", semiannual: "Semiannual", annual: "Annual", irregular: "Irregular", none: "None", unknown: "Unknown",\n    covered: "Covered", stretched: "Stretched", notCovered: "Not covered", insufficient: "Insufficient data", events: "events",\n    historicalCoverage: "Historical coverage", financialsCoverage: "Financials", priceCoverage: "Price history", valuationCoverage: "Valuation history", dividendCoverage: "Dividend history",\n    coverageSeparate: "Coverage is separate from model confidence", fullCoverage: "Full coverage", partialCoverage: "Insufficient history", unavailableCoverage: "Unavailable", notApplicableCoverage: "Not applicable", nmNegativeEarnings: "N/M — negative earnings", observations: "observations",''',
)

replace_once(
    "src/components/analysis/historical-research.tsx",
    '''function HistoricalSnapshot({ report, locale }: { report: AnalysisReport; locale: Locale }) {''',
    '''function HistoricalCoverageCard({ report, locale }: { report: AnalysisReport; locale: Locale }) {\n  const coverage = report.historical?.coverage;\n  if (!coverage) return null;\n  const copy = copyFor(locale);\n  const extra = extraCopyFor(locale);\n  const statusLabel = (item: HistoricalCoverageItem) => item.status === "full"\n    ? extra.fullCoverage\n    : item.status === "partial"\n      ? extra.partialCoverage\n      : item.status === "not_applicable"\n        ? extra.notApplicableCoverage\n        : extra.unavailableCoverage;\n  const yearsLabel = (item: HistoricalCoverageItem) =>\n    formatNumber(item.availableYears, locale, copy.unavailable, 1) + "/" + item.requestedYears + " " + extra.years;\n  const rows: Array<{ key: string; label: string; item: HistoricalCoverageItem; suffix?: string }> = [\n    { key: "financials", label: extra.financialsCoverage, item: coverage.financials },\n    { key: "price", label: extra.priceCoverage, item: coverage.price },\n    { key: "valuation", label: extra.valuationCoverage, item: coverage.valuation },\n    {\n      key: "dividend",\n      label: extra.dividendCoverage,\n      item: coverage.dividend,\n      suffix: coverage.dividend.eventCoverageYears === undefined\n        ? undefined\n        : " · " + formatNumber(coverage.dividend.eventCoverageYears, locale, copy.unavailable, 1) + " " + extra.years + " " + extra.events,\n    },\n  ];\n  return (\n    <Card className="border-[#b99b5f]/20 bg-[#b99b5f]/[0.025]">\n      <div className="flex flex-wrap items-center justify-between gap-2">\n        <h2 className="text-lg font-semibold text-[#f4efe5]">{extra.historicalCoverage}</h2>\n        <Badge>{coverage.methodVersion}</Badge>\n      </div>\n      <p className="mt-2 text-xs leading-5 text-[#9aa7b8]">{extra.coverageSeparate}.</p>\n      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">\n        {rows.map(({ key, label, item, suffix }) => (\n          <div key={key} className="rounded-md border border-white/10 bg-white/5 p-3">\n            <p className="text-xs text-[#9aa7b8]">{label}</p>\n            <p className="number mt-1 text-lg font-semibold text-[#f4efe5]">{yearsLabel(item)}{suffix ?? ""}</p>\n            <p className="mt-1 text-xs text-[#9aa7b8]">{statusLabel(item)} · {item.observationCount} {extra.observations}</p>\n          </div>\n        ))}\n      </div>\n    </Card>\n  );\n}\n\nfunction HistoricalSnapshot({ report, locale }: { report: AnalysisReport; locale: Locale }) {''',
)

replace_once(
    "src/components/analysis/historical-research.tsx",
    '''  const windowYield = (window: HistoricalValuationWindowStats | undefined) =>\n    valuationWindowValue(window, (value) => value.dividendYieldAverage, (value) => percent(value), extra.insufficientHistory);\n\n  const rows = [''',
    '''  const windowYield = (window: HistoricalValuationWindowStats | undefined) =>\n    valuationWindowValue(window, (value) => value.dividendYieldAverage, (value) => percent(value), extra.insufficientHistory);\n  const currentPe = valuation?.currentPriceEarningsStatus === "not_meaningful"\n    ? extra.nmNegativeEarnings\n    : multiple(valuation?.currentPriceEarnings);\n\n  const rows = [''',
)

replace_once(
    "src/components/analysis/historical-research.tsx",
    '''        multiple(valuation?.currentPriceEarnings),\n        windowPe(valuation?.oneYear),''',
    '''        currentPe,\n        windowPe(valuation?.oneYear),''',
)

replace_once(
    "src/components/analysis/historical-research.tsx",
    '''            <Stat label={extra.currentPe} value={formatNumber(valuation.currentPriceEarnings, locale, copy.unavailable, 1)} />''',
    '''            <Stat label={extra.currentPe} value={valuation.currentPriceEarningsStatus === "not_meaningful" ? extra.nmNegativeEarnings : formatNumber(valuation.currentPriceEarnings, locale, copy.unavailable, 1)} />''',
)

replace_once(
    "src/components/analysis/historical-research.tsx",
    '''      {dividendProfile ? <DividendSnapshot report={report} locale={locale} /> : null}\n      {mode === "simple" ? <PriceContextCard report={report} locale={locale} /> : null}''',
    '''      {dividendProfile ? <DividendSnapshot report={report} locale={locale} /> : null}\n      {mode === "simple" ? <HistoricalCoverageCard report={report} locale={locale} /> : null}\n      {mode === "simple" ? <PriceContextCard report={report} locale={locale} /> : null}''',
)

print("historical coverage P0 patch applied")
