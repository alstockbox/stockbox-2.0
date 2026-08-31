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
  `export type DividendResearchContext = {\n  methodVersion: string;\n  status: \"available\" | \"partial\" | \"nonpayer\" | \"unavailable\";\n  trailingDividendsPerShare: number | null;\n  currentDividendYield: number | null;\n  paymentCountTtm: number;\n  paymentFrequency: \"monthly\" | \"quarterly\" | \"semiannual\" | \"annual\" | \"irregular\" | \"none\" | \"unknown\";\n  latestPaymentDate: string | null;\n  latestPaymentAmount: number | null;\n  latestPaymentCurrency: string | null;\n  increaseStreakYears: number | null;\n  safety: \"covered\" | \"stretched\" | \"not_covered\" | \"insufficient\";\n  annualHistoryYears: number;\n  eventCoverageYears: number;\n};\n\nexport type HistoricalResearchData = {\n  financials: HistoricalFinancialPoint[];`,
  "dividend research context type",
);
replaceOnce(
  "src/lib/analysis/types.ts",
  `  priceContext?: HistoricalPriceContext;\n  valuation?: HistoricalValuationPoint[];`,
  `  priceContext?: HistoricalPriceContext;\n  dividendContext?: DividendResearchContext;\n  valuation?: HistoricalValuationPoint[];`,
  "dividend context field",
);

replaceOnce(
  "src/lib/analysis/historical.ts",
  `  FinancialPeriod,\n  HistoricalFinancialPoint,`,
  `  DividendResearchContext,\n  FinancialPeriod,\n  HistoricalFinancialPoint,`,
  "dividend context type import",
);
replaceOnce(
  "src/lib/analysis/historical.ts",
  `  buildHistoricalValuationSeries,\n  HISTORICAL_VALUATION_METHOD_VERSION,`,
  `  buildHistoricalValuationSeries,\n  HISTORICAL_VALUATION_METHOD_VERSION,\n  trailingDividendPerShare,`,
  "trailing dividend helper import",
);
replaceOnce(
  "src/lib/analysis/historical.ts",
  `const MAX_PRICE_POINTS = 121;`,
  `const MAX_PRICE_POINTS = 121;\nexport const DIVIDEND_CONTEXT_METHOD_VERSION = \"dividend-context-v1\";`,
  "dividend method version",
);
replaceOnce(
  "src/lib/analysis/historical.ts",
  `  const positiveNetIncome = positive(period.netIncome);\n  const dividendPerShare = shareCount !== null && isFiniteNumber(dividends) ? dividends / shareCount : null;`,
  `  const positiveDilutedEps = positive(period.epsDiluted);\n  const dividendPerShare = shareCount !== null && isFiniteNumber(dividends) ? dividends / shareCount : null;`,
  "EPS payout denominator",
);
replaceOnce(
  "src/lib/analysis/historical.ts",
  `    payoutRatio: positiveNetIncome !== null && isFiniteNumber(dividends)\n      ? dividends / positiveNetIncome\n      : null,`,
  `    payoutRatio: positiveDilutedEps !== null && isFiniteNumber(dividendPerShare)\n      ? dividendPerShare / positiveDilutedEps\n      : null,`,
  "EPS payout formula",
);

const dividendHelperAnchor = `function dividendStreakStats(points: HistoricalFinancialPoint[]) {\n`;
const dividendHelpers = `function eventCoverageYears(events: MarketDividendEvent[]): number {\n  if (events.length < 2) return 0;\n  const first = parsedPriceDate(events[0]?.date);\n  const last = parsedPriceDate(events.at(-1)?.date);\n  if (first === null || last === null || last < first) return 0;\n  return (last - first) / (365.2425 * 86_400_000);\n}\n\nfunction inferPaymentFrequency(\n  events: MarketDividendEvent[] | undefined,\n  annualPayer: boolean,\n): DividendResearchContext[\"paymentFrequency\"] {\n  if (events === undefined) return \"unknown\";\n  if (!events.length) return annualPayer ? \"unknown\" : \"none\";\n  if (events.length < 2) return \"unknown\";\n  const gaps = events.slice(1).map((event, index) => {\n    const current = parsedPriceDate(event.date);\n    const prior = parsedPriceDate(events[index]?.date);\n    return current !== null && prior !== null ? (current - prior) / 86_400_000 : null;\n  }).filter((value): value is number => isFiniteNumber(value) && value > 0).sort((a, b) => a - b);\n  if (!gaps.length) return \"unknown\";\n  const middle = Math.floor(gaps.length / 2);\n  const median = gaps.length % 2 ? gaps[middle] : (gaps[middle - 1] + gaps[middle]) / 2;\n  if (median >= 20 && median <= 45) return \"monthly\";\n  if (median >= 60 && median <= 120) return \"quarterly\";\n  if (median >= 130 && median <= 220) return \"semiannual\";\n  if (median >= 280 && median <= 430) return \"annual\";\n  return \"irregular\";\n}\n\nfunction consecutiveDividendIncreaseStreak(points: HistoricalFinancialPoint[]): number | null {\n  if (points.length < 2) return null;\n  let streak = 0;\n  for (let index = points.length - 1; index > 0; index -= 1) {\n    const current = positive(points[index]?.dividendPerShare);\n    const prior = positive(points[index - 1]?.dividendPerShare);\n    if (current === null || prior === null) return streak > 0 ? streak : null;\n    if (current / prior - 1 > 0.005) streak += 1;\n    else break;\n  }\n  return streak;\n}\n\nfunction dividendSafety(points: HistoricalFinancialPoint[]): DividendResearchContext[\"safety\"] {\n  const latest = points.at(-1);\n  const epsPayout = latest?.payoutRatio;\n  const fcfPayout = latest?.freeCashFlowPayoutRatio;\n  if (!isFiniteNumber(epsPayout) || !isFiniteNumber(fcfPayout) || epsPayout < 0 || fcfPayout < 0) return \"insufficient\";\n  if (epsPayout > 1 || fcfPayout > 1) return \"not_covered\";\n  if (epsPayout <= 0.75 && fcfPayout <= 0.75) return \"covered\";\n  return \"stretched\";\n}\n\nfunction buildDividendResearchContext(\n  points: HistoricalFinancialPoint[],\n  prices: MarketPricePoint[],\n  options: HistoricalResearchOptions,\n): DividendResearchContext {\n  const latestPrice = prices.at(-1) ?? null;\n  const currentPrice = positive(options.currentPrice) ?? positive(latestPrice?.close);\n  const currentDate = (parsedPriceDate(options.currentPriceDate) !== null\n    ? options.currentPriceDate\n    : latestPrice?.date)?.slice(0, 10) ?? null;\n  const endMs = parsedPriceDate(currentDate);\n  const events = options.dividendEvents === undefined ? undefined : [...options.dividendEvents]\n    .filter((event) => {\n      const time = parsedPriceDate(event.date);\n      return time !== null && (endMs === null || time <= endMs) && isFiniteNumber(event.amount) && event.amount > 0;\n    })\n    .sort((left, right) => left.date.localeCompare(right.date));\n  const trailing = currentDate\n    ? trailingDividendPerShare(currentDate, options.dividendEvents)\n    : { amount: null, paymentCount: 0 };\n  const latestPayment = events?.at(-1) ?? null;\n  const latestAnnual = points.at(-1);\n  const annualPayer = positive(latestAnnual?.dividendPerShare) !== null;\n  const hasEvents = Boolean(events?.length);\n  const annualHistoryYears = points.filter((point) => isFiniteNumber(point.dividendPerShare)).length;\n  const currentDividendYield = currentPrice !== null && trailing.amount !== null ? trailing.amount / currentPrice : null;\n  const status: DividendResearchContext[\"status\"] = hasEvents && currentDividendYield !== null && annualHistoryYears > 0\n    ? \"available\"\n    : hasEvents || annualPayer\n      ? \"partial\"\n      : options.dividendEvents !== undefined\n        ? \"nonpayer\"\n        : \"unavailable\";\n  return {\n    methodVersion: DIVIDEND_CONTEXT_METHOD_VERSION,\n    status,\n    trailingDividendsPerShare: trailing.amount,\n    currentDividendYield,\n    paymentCountTtm: trailing.paymentCount,\n    paymentFrequency: inferPaymentFrequency(events, annualPayer),\n    latestPaymentDate: latestPayment?.date ?? null,\n    latestPaymentAmount: latestPayment?.amount ?? null,\n    latestPaymentCurrency: latestPayment?.currency ?? null,\n    increaseStreakYears: consecutiveDividendIncreaseStreak(points),\n    safety: dividendSafety(points),\n    annualHistoryYears,\n    eventCoverageYears: eventCoverageYears(events ?? []),\n  };\n}\n\nfunction dividendStreakStats(points: HistoricalFinancialPoint[]) {\n`;
replaceOnce("src/lib/analysis/historical.ts", dividendHelperAnchor, dividendHelpers, "dividend context helpers");
replaceOnce(
  "src/lib/analysis/historical.ts",
  `  const dividendStats = dividendStreakStats(points);\n  const priceContext = buildHistoricalPriceContext(sortedPrices, options);`,
  `  const dividendStats = dividendStreakStats(points);\n  const priceContext = buildHistoricalPriceContext(sortedPrices, options);\n  const dividendContext = buildDividendResearchContext(points, sortedPrices, options);`,
  "build dividend context",
);
replaceOnce(
  "src/lib/analysis/historical.ts",
  `    priceContext,\n    valuation,`,
  `    priceContext,\n    dividendContext,\n    valuation,`,
  "return dividend context",
);

replaceOnce(
  "src/components/analysis/historical-research.tsx",
  `    below: \"under\", above: \"över\", priceContextNote: \"52-veckorsintervallet använder providerdata när den är komplett, annars verifierad 1-årshistorik. Flerårsintervall visas bara när faktisk tidsbredd är tillräcklig.\",\n    years:`,
  `    below: \"under\", above: \"över\", priceContextNote: \"52-veckorsintervallet använder providerdata när den är komplett, annars verifierad 1-årshistorik. Flerårsintervall visas bara när faktisk tidsbredd är tillräcklig.\",\n    paymentFrequency: \"Betalningsfrekvens\", latestPayment: \"Senaste betalning\", increaseStreak: \"Höjningssvit\", dividendSafety: \"Utdelningssäkerhet\", coverage: \"Täckning\",\n    monthly: \"Månadsvis\", quarterly: \"Kvartalsvis\", semiannual: \"Halvårsvis\", annual: \"Årlig\", irregular: \"Oregelbunden\", none: \"Ingen\", unknown: \"Okänd\",\n    covered: \"Täckt\", stretched: \"Ansträngd\", notCovered: \"Ej täckt\", insufficient: \"Otillräckligt underlag\", events: \"event\",\n    years:`,
  "Swedish dividend context copy",
);
replaceOnce(
  "src/components/analysis/historical-research.tsx",
  `    below: \"below\", above: \"above\", priceContextNote: \"The 52-week range uses provider data when complete, otherwise verified one-year price history. Multi-year ranges are shown only when actual time coverage is sufficient.\",\n    years:`,
  `    below: \"below\", above: \"above\", priceContextNote: \"The 52-week range uses provider data when complete, otherwise verified one-year price history. Multi-year ranges are shown only when actual time coverage is sufficient.\",\n    paymentFrequency: \"Payment frequency\", latestPayment: \"Latest payment\", increaseStreak: \"Increase streak\", dividendSafety: \"Dividend safety\", coverage: \"Coverage\",\n    monthly: \"Monthly\", quarterly: \"Quarterly\", semiannual: \"Semiannual\", annual: \"Annual\", irregular: \"Irregular\", none: \"None\", unknown: \"Unknown\",\n    covered: \"Covered\", stretched: \"Stretched\", notCovered: \"Not covered\", insufficient: \"Insufficient data\", events: \"events\",\n    years:`,
  "English dividend context copy",
);

replaceOnce(
  "src/components/analysis/historical-research.tsx",
  `  const latest = latestFinancial(historical.financials);\n  const valuation = historical.valuationContext;\n  return (`,
  `  const latest = latestFinancial(historical.financials);\n  const valuation = historical.valuationContext;\n  const context = historical.dividendContext;\n  const frequencyLabel = context?.paymentFrequency ? extra[context.paymentFrequency] : copy.unavailable;\n  const safetyLabel = context?.safety === \"covered\" ? extra.covered\n    : context?.safety === \"stretched\" ? extra.stretched\n      : context?.safety === \"not_covered\" ? extra.notCovered\n        : extra.insufficient;\n  const latestPayment = context?.latestPaymentDate && isNumber(context.latestPaymentAmount)\n    ? formatMoney(context.latestPaymentAmount, context.latestPaymentCurrency ?? latest?.currency ?? report.reportingCurrency, locale, copy.unavailable, false) + \" · \" + context.latestPaymentDate\n    : copy.unavailable;\n  const coverage = context\n    ? context.annualHistoryYears + \" \" + extra.years + \" · \" + formatNumber(context.eventCoverageYears, locale, copy.unavailable, 1) + \" \" + extra.years + \" \" + extra.events\n    : copy.unavailable;\n  return (`,
  "dividend snapshot context variables",
);
replaceOnce(
  "src/components/analysis/historical-research.tsx",
  `        <Stat label={extra.latestDps} value={formatMoney(valuation?.currentTrailingDividendsPerShare ?? null, latest?.currency ?? report.reportingCurrency, locale, copy.unavailable, false)} />\n        <Stat label={extra.latestYield} value={formatPercent(valuation?.currentDividendYield ?? null, locale, copy.unavailable)} />`,
  `        <Stat label={extra.latestDps} value={formatMoney(context?.trailingDividendsPerShare ?? valuation?.currentTrailingDividendsPerShare ?? null, latest?.currency ?? report.reportingCurrency, locale, copy.unavailable, false)} />\n        <Stat label={extra.latestYield} value={formatPercent(context?.currentDividendYield ?? valuation?.currentDividendYield ?? null, locale, copy.unavailable)} />\n        <Stat label={extra.paymentFrequency} value={frequencyLabel} />\n        <Stat label={extra.latestPayment} value={latestPayment} />\n        <Stat label={extra.increaseStreak} value={context?.increaseStreakYears === null || context?.increaseStreakYears === undefined ? copy.unavailable : context.increaseStreakYears + \" \" + extra.years} />\n        <Stat label={extra.dividendSafety} value={safetyLabel} />\n        <Stat label={extra.coverage} value={coverage} />`,
  "dividend snapshot context stats",
);
replaceOnce(
  "src/components/analysis/historical-research.tsx",
  `  const dividendProfile = report.investmentProfile === \"dividend\";\n  return (\n    <div className=\"space-y-5\">\n      {dividendProfile ? <DividendSnapshot report={report} locale={locale} /> : null}`,
  `  const dividendProfile = report.investmentProfile === \"dividend\";\n  const dividendStatus = historical.dividendContext?.status;\n  const showDividendSnapshot = dividendProfile || (mode === \"simple\" && (dividendStatus === \"available\" || dividendStatus === \"partial\"));\n  return (\n    <div className=\"space-y-5\">\n      {showDividendSnapshot ? <DividendSnapshot report={report} locale={locale} /> : null}`,
  "discoverable dividend snapshot",
);

console.log("Dividend context P0 patch applied with all guards satisfied.");
