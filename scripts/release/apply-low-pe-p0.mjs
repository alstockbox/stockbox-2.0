import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function write(path, content) {
  fs.writeFileSync(path, content, "utf8");
}

function replaceOnce(content, search, replacement, label) {
  const count = content.split(search).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected exactly one match, found ${count}`);
  }
  return content.replace(search, replacement);
}

function requireContains(content, needle, label) {
  if (!content.includes(needle)) throw new Error(`${label}: postcondition missing: ${needle}`);
}

const typesPath = "src/lib/analysis/types.ts";
let types = read(typesPath);
types = replaceOnce(
  types,
  "export type HistoricalResearchData = {\n",
  `export type HistoricalDiscountSignalStatus = "healthy" | "warning" | "severe" | "unavailable" | "not_applicable";\n\nexport type HistoricalDiscountSignal = {\n  key: "growth" | "freeCashFlow" | "roic" | "margins" | "leverage" | "dilution" | "cashConversion" | "earningsStability";\n  label: string;\n  status: HistoricalDiscountSignalStatus;\n  detail: string;\n  value: number | null;\n  weight: number;\n};\n\nexport type HistoricalDiscountQualityClassification =\n  | "STRONG"\n  | "REASONABLE"\n  | "MIXED"\n  | "QUESTIONABLE"\n  | "MISLEADING"\n  | "INSUFFICIENT DATA";\n\nexport type HistoricalDiscountQuality = {\n  methodVersion: string;\n  status: "discount" | "not_discount" | "insufficient";\n  classification: HistoricalDiscountQualityClassification | null;\n  discountToReferenceMedian: number | null;\n  referenceWindow: "5Y" | "MAX" | null;\n  coverage: number;\n  evaluatedSignalCount: number;\n  applicableSignalCount: number;\n  deteriorationScore: number | null;\n  signals: HistoricalDiscountSignal[];\n  summary: string;\n};\n\nexport type HistoricalResearchData = {\n`,
  "types: insert historical discount quality contracts",
);
types = replaceOnce(
  types,
  "  valuationMethodVersion?: string;\n  revenueCagr3y: number | null;\n",
  "  valuationMethodVersion?: string;\n  discountQuality?: HistoricalDiscountQuality;\n  revenueCagr3y: number | null;\n",
  "types: attach discount quality to historical research data",
);
requireContains(types, "discountQuality?: HistoricalDiscountQuality;", "types");
write(typesPath, types);

const enginePath = "src/lib/analysis/engine.ts";
let engine = read(enginePath);
engine = replaceOnce(
  engine,
  'import { buildHistoricalResearchData } from "./historical";\n',
  'import { buildHistoricalResearchData } from "./historical";\nimport { evaluateHistoricalDiscountQuality } from "./historical-discount-quality";\n',
  "engine: import discount quality evaluator",
);
engine = replaceOnce(
  engine,
  "  const companyName = canonicalInput.company.name ?? legacyInput.company.name;\n  const report: AnalysisReport = {\n",
  `  const companyName = canonicalInput.company.name ?? legacyInput.company.name;\n  const historicalBase = canonicalInput.annualPeriods.length || legacyInput.market?.priceHistory?.length\n    ? buildHistoricalResearchData(canonicalInput.annualPeriods, legacyInput.market?.priceHistory ?? [], {\n        ttmEpsHistory: legacyInput.fundamentals?.historicalTtmEps,\n        dividendEvents: legacyInput.market?.dividendEvents,\n        currentPriceEarnings: result.metrics.valuation.priceEarnings,\n      })\n    : undefined;\n  const historical = historicalBase\n    ? {\n        ...historicalBase,\n        discountQuality: evaluateHistoricalDiscountQuality({\n          valuation: historicalBase.valuationContext,\n          metrics: result.metrics,\n          financials: historicalBase.financials,\n          archetype: result.analysisArchetype,\n        }),\n      }\n    : undefined;\n  const report: AnalysisReport = {\n`,
  "engine: build historical discount quality before report",
);
engine = replaceOnce(
  engine,
  `    historical: canonicalInput.annualPeriods.length || legacyInput.market?.priceHistory?.length\n      ? buildHistoricalResearchData(canonicalInput.annualPeriods, legacyInput.market?.priceHistory ?? [], {\n          ttmEpsHistory: legacyInput.fundamentals?.historicalTtmEps,\n          dividendEvents: legacyInput.market?.dividendEvents,\n          currentPriceEarnings: result.metrics.valuation.priceEarnings,\n        })\n      : undefined,\n`,
  "    historical,\n",
  "engine: use enriched historical report object",
);
requireContains(engine, "discountQuality: evaluateHistoricalDiscountQuality({", "engine");
write(enginePath, engine);

const uiPath = "src/components/analysis/historical-research.tsx";
let ui = read(uiPath);
ui = replaceOnce(
  ui,
  `    ttmEps: "TTM EPS", ttmDividend: "TTM utdelning/aktie", valuationDate: "Datum", insufficientHistory: "Otillräcklig historik",\n    years: "år", reportedDerived: "Rapporterade och deterministiskt härledda värden. Saknade eller olämpliga mått lämnas tomma.",\n`,
  `    ttmEps: "TTM EPS", ttmDividend: "TTM utdelning/aktie", valuationDate: "Datum", insufficientHistory: "Otillräcklig historik",\n    discountQuality: "Historisk rabattkvalitet", discountVsHistoricalMedian: "Rabatt mot historisk median",\n    evidenceCoverage: "Evidenstäckning", deteriorationScore: "Försämringspoäng", notApplicable: "Ej tillämpligt",\n    signalEvidence: "Deterministiska signaler",\n    years: "år", reportedDerived: "Rapporterade och deterministiskt härledda värden. Saknade eller olämpliga mått lämnas tomma.",\n`,
  "ui: add Swedish discount quality copy",
);
ui = replaceOnce(
  ui,
  `    ttmEps: "TTM EPS", ttmDividend: "TTM dividend / share", valuationDate: "Date", insufficientHistory: "Insufficient history",\n    years: "years", reportedDerived: "Reported and deterministically derived values. Missing or unsuitable metrics remain unavailable.",\n`,
  `    ttmEps: "TTM EPS", ttmDividend: "TTM dividend / share", valuationDate: "Date", insufficientHistory: "Insufficient history",\n    discountQuality: "Historical Discount Quality", discountVsHistoricalMedian: "Discount vs historical median",\n    evidenceCoverage: "Evidence coverage", deteriorationScore: "Deterioration score", notApplicable: "Not applicable",\n    signalEvidence: "Deterministic signals",\n    years: "years", reportedDerived: "Reported and deterministically derived values. Missing or unsuitable metrics remain unavailable.",\n`,
  "ui: add English discount quality copy",
);
ui = replaceOnce(
  ui,
  "function GrowthHistory({ report, locale }: { report: AnalysisReport; locale: Locale }) {\n",
  `function HistoricalDiscountQualityCard({ report, locale }: { report: AnalysisReport; locale: Locale }) {\n  const quality = report.historical?.discountQuality;\n  if (!quality) return null;\n  const copy = copyFor(locale);\n  const extra = extraCopyFor(locale);\n  const warnings = quality.signals.filter((signal) => signal.status === "warning" || signal.status === "severe");\n  const summary = locale === "sv"\n    ? quality.status === "not_discount"\n      ? "Nuvarande P/E ligger inte under den valda historiska medianen, så rabattkvalitet är inte tillämplig."\n      : quality.classification === "INSUFFICIENT DATA"\n        ? "Det finns inte tillräckligt med jämförbar evidens för att bedöma kvaliteten på den historiska P/E-rabatten."\n        : warnings.length\n          ? \\`\\${warnings.length} försämringssignal\\${warnings.length === 1 ? "" : "er"} sänker kvaliteten på den historiska P/E-rabatten.\\`\n          : "Ingen materiell försämringssignal hittades i den jämförbara evidensen som används av den versionerade regelmotorn."\n    : quality.summary;\n  return (\n    <Card className="border-[#b99b5f]/20 bg-[#b99b5f]/[0.03]">\n      <div className="flex flex-wrap items-center justify-between gap-2">\n        <h2 className="text-lg font-semibold text-[#f4efe5]">{extra.discountQuality}</h2>\n        <Badge>{quality.methodVersion}</Badge>\n      </div>\n      <p className="mt-2 text-xs leading-5 text-[#9aa7b8]">\n        {locale === "sv" ? "Låg P/E klassas inte automatiskt som billig. StockBox testar om fundamenta har försämrats med en versionerad regelmotor." : "A low P/E is not treated as automatically cheap. StockBox tests whether fundamentals have deteriorated using a versioned rule set."}\n      </p>\n      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">\n        <Stat label={copy.classification} value={quality.classification ?? extra.notApplicable} />\n        <Stat label={extra.discountVsHistoricalMedian} value={formatPercent(quality.discountToReferenceMedian, locale, copy.unavailable)} />\n        <Stat label={extra.evidenceCoverage} value={formatPercent(quality.coverage, locale, copy.unavailable)} />\n        <Stat label={extra.deteriorationScore} value={formatPercent(quality.deteriorationScore, locale, copy.unavailable)} />\n      </div>\n      <p className="mt-3 text-sm leading-6 text-[#c9d2df]">{summary}</p>\n      {warnings.length ? (\n        <div className="mt-3 flex flex-wrap gap-2" aria-label={extra.signalEvidence}>\n          {warnings.map((signal) => (\n            <Badge key={signal.key}>{signal.label}: {signal.status}</Badge>\n          ))}\n        </div>\n      ) : null}\n      <p className="mt-3 text-xs text-[#7f8da0]">\n        {quality.evaluatedSignalCount}/{quality.applicableSignalCount} {extra.signalEvidence.toLowerCase()} · {quality.referenceWindow ?? copy.unavailable}\n      </p>\n    </Card>\n  );\n}\n\nfunction GrowthHistory({ report, locale }: { report: AnalysisReport; locale: Locale }) {\n`,
  "ui: add discount quality card",
);
ui = replaceOnce(
  ui,
  "      <HistoricalOverview report={report} locale={locale} />\n      {mode === \"pro\" ? (\n",
  "      <HistoricalOverview report={report} locale={locale} />\n      <HistoricalDiscountQualityCard report={report} locale={locale} />\n      {mode === \"pro\" ? (\n",
  "ui: render discount quality card in simple and pro",
);
requireContains(ui, "Historical Discount Quality", "ui");
requireContains(ui, "<HistoricalDiscountQualityCard report={report} locale={locale} />", "ui");
write(uiPath, ui);

const exportPath = "src/lib/analysis/financial-data-export.ts";
let exportFile = read(exportPath);
exportFile = replaceOnce(
  exportFile,
  `  const valuationSection = valuationRows.length\n    ? [\n        "",\n        \\`historicalValuationMethodVersion,\\${csvCell(historical.valuationMethodVersion)}\\`,\n        valuationHeaders.join(","),\n        ...valuationRows,\n      ]\n    : [];\n  return [historicalHeaders.join(","), ...rows, ...valuationSection].join("\\n");\n`,
  `  const valuationSection = valuationRows.length\n    ? [\n        "",\n        \\`historicalValuationMethodVersion,\\${csvCell(historical.valuationMethodVersion)}\\`,\n        valuationHeaders.join(","),\n        ...valuationRows,\n      ]\n    : [];\n  const quality = historical.discountQuality;\n  const discountQualitySection = quality\n    ? [\n        "",\n        "historicalDiscountQuality",\n        \\`methodVersion,\\${csvCell(quality.methodVersion)}\\`,\n        \\`status,\\${csvCell(quality.status)}\\`,\n        \\`classification,\\${csvCell(quality.classification)}\\`,\n        \\`discountToReferenceMedian,\\${csvCell(quality.discountToReferenceMedian)}\\`,\n        \\`referenceWindow,\\${csvCell(quality.referenceWindow)}\\`,\n        \\`evidenceCoverage,\\${csvCell(quality.coverage)}\\`,\n        \\`deteriorationScore,\\${csvCell(quality.deteriorationScore)}\\`,\n        \\`evaluatedSignalCount,\\${csvCell(quality.evaluatedSignalCount)}\\`,\n        \\`applicableSignalCount,\\${csvCell(quality.applicableSignalCount)}\\`,\n        \\`summary,\\${csvCell(quality.summary)}\\`,\n        "signalKey,signalLabel,signalStatus,signalValue,signalWeight,signalDetail",\n        ...quality.signals.map((signal) => [\n          signal.key, signal.label, signal.status, signal.value, signal.weight, signal.detail,\n        ].map(csvCell).join(",")),\n      ]\n    : [];\n  return [historicalHeaders.join(","), ...rows, ...valuationSection, ...discountQualitySection].join("\\n");\n`,
  "export: append discount quality section",
);
requireContains(exportFile, "historicalDiscountQuality", "export");
write(exportPath, exportFile);

console.log("Low P/E historical discount quality P0 patch applied with all guards satisfied.");
