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
  [
    'export type HistoricalDiscountSignalStatus = "healthy" | "warning" | "severe" | "unavailable" | "not_applicable";',
    "",
    "export type HistoricalDiscountSignal = {",
    '  key: "growth" | "freeCashFlow" | "roic" | "margins" | "leverage" | "dilution" | "cashConversion" | "earningsStability";',
    "  label: string;",
    "  status: HistoricalDiscountSignalStatus;",
    "  detail: string;",
    "  value: number | null;",
    "  weight: number;",
    "};",
    "",
    "export type HistoricalDiscountQualityClassification =",
    '  | "STRONG"',
    '  | "REASONABLE"',
    '  | "MIXED"',
    '  | "QUESTIONABLE"',
    '  | "MISLEADING"',
    '  | "INSUFFICIENT DATA";',
    "",
    "export type HistoricalDiscountQuality = {",
    "  methodVersion: string;",
    '  status: "discount" | "not_discount" | "insufficient";',
    "  classification: HistoricalDiscountQualityClassification | null;",
    "  discountToReferenceMedian: number | null;",
    '  referenceWindow: "5Y" | "MAX" | null;',
    "  coverage: number;",
    "  evaluatedSignalCount: number;",
    "  applicableSignalCount: number;",
    "  deteriorationScore: number | null;",
    "  signals: HistoricalDiscountSignal[];",
    "  summary: string;",
    "};",
    "",
    "export type HistoricalResearchData = {",
    "",
  ].join("\n"),
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
  [
    "  const companyName = canonicalInput.company.name ?? legacyInput.company.name;",
    "  const historicalBase = canonicalInput.annualPeriods.length || legacyInput.market?.priceHistory?.length",
    "    ? buildHistoricalResearchData(canonicalInput.annualPeriods, legacyInput.market?.priceHistory ?? [], {",
    "        ttmEpsHistory: legacyInput.fundamentals?.historicalTtmEps,",
    "        dividendEvents: legacyInput.market?.dividendEvents,",
    "        currentPriceEarnings: result.metrics.valuation.priceEarnings,",
    "      })",
    "    : undefined;",
    "  const historical = historicalBase",
    "    ? {",
    "        ...historicalBase,",
    "        discountQuality: evaluateHistoricalDiscountQuality({",
    "          valuation: historicalBase.valuationContext,",
    "          metrics: result.metrics,",
    "          financials: historicalBase.financials,",
    "          archetype: result.analysisArchetype,",
    "        }),",
    "      }",
    "    : undefined;",
    "  const report: AnalysisReport = {",
    "",
  ].join("\n"),
  "engine: build historical discount quality before report",
);
engine = replaceOnce(
  engine,
  [
    "    historical: canonicalInput.annualPeriods.length || legacyInput.market?.priceHistory?.length",
    "      ? buildHistoricalResearchData(canonicalInput.annualPeriods, legacyInput.market?.priceHistory ?? [], {",
    "          ttmEpsHistory: legacyInput.fundamentals?.historicalTtmEps,",
    "          dividendEvents: legacyInput.market?.dividendEvents,",
    "          currentPriceEarnings: result.metrics.valuation.priceEarnings,",
    "        })",
    "      : undefined,",
    "",
  ].join("\n"),
  "    historical,\n",
  "engine: use enriched historical report object",
);
requireContains(engine, "discountQuality: evaluateHistoricalDiscountQuality({", "engine");
write(enginePath, engine);

const uiPath = "src/components/analysis/historical-research.tsx";
let ui = read(uiPath);
ui = replaceOnce(
  ui,
  '    ttmEps: "TTM EPS", ttmDividend: "TTM utdelning/aktie", valuationDate: "Datum", insufficientHistory: "Otillräcklig historik",\n    years: "år", reportedDerived: "Rapporterade och deterministiskt härledda värden. Saknade eller olämpliga mått lämnas tomma.",\n',
  '    ttmEps: "TTM EPS", ttmDividend: "TTM utdelning/aktie", valuationDate: "Datum", insufficientHistory: "Otillräcklig historik",\n    discountQuality: "Historisk rabattkvalitet", discountVsHistoricalMedian: "Rabatt mot historisk median",\n    evidenceCoverage: "Evidenstäckning", deteriorationScore: "Försämringspoäng", notApplicable: "Ej tillämpligt",\n    signalEvidence: "Deterministiska signaler",\n    years: "år", reportedDerived: "Rapporterade och deterministiskt härledda värden. Saknade eller olämpliga mått lämnas tomma.",\n',
  "ui: add Swedish discount quality copy",
);
ui = replaceOnce(
  ui,
  '    ttmEps: "TTM EPS", ttmDividend: "TTM dividend / share", valuationDate: "Date", insufficientHistory: "Insufficient history",\n    years: "years", reportedDerived: "Reported and deterministically derived values. Missing or unsuitable metrics remain unavailable.",\n',
  '    ttmEps: "TTM EPS", ttmDividend: "TTM dividend / share", valuationDate: "Date", insufficientHistory: "Insufficient history",\n    discountQuality: "Historical Discount Quality", discountVsHistoricalMedian: "Discount vs historical median",\n    evidenceCoverage: "Evidence coverage", deteriorationScore: "Deterioration score", notApplicable: "Not applicable",\n    signalEvidence: "Deterministic signals",\n    years: "years", reportedDerived: "Reported and deterministically derived values. Missing or unsuitable metrics remain unavailable.",\n',
  "ui: add English discount quality copy",
);
const cardLines = [
  "function HistoricalDiscountQualityCard({ report, locale }: { report: AnalysisReport; locale: Locale }) {",
  "  const quality = report.historical?.discountQuality;",
  "  if (!quality) return null;",
  "  const copy = copyFor(locale);",
  "  const extra = extraCopyFor(locale);",
  '  const warnings = quality.signals.filter((signal) => signal.status === "warning" || signal.status === "severe");',
  '  const summary = locale === "sv"',
  '    ? quality.status === "not_discount"',
  '      ? "Nuvarande P/E ligger inte under den valda historiska medianen, så rabattkvalitet är inte tillämplig."',
  '      : quality.classification === "INSUFFICIENT DATA"',
  '        ? "Det finns inte tillräckligt med jämförbar evidens för att bedöma kvaliteten på den historiska P/E-rabatten."',
  "        : warnings.length",
  '          ? String(warnings.length) + " försämringssignal" + (warnings.length === 1 ? "" : "er") + " sänker kvaliteten på den historiska P/E-rabatten."',
  '          : "Ingen materiell försämringssignal hittades i den jämförbara evidensen som används av den versionerade regelmotorn."',
  "    : quality.summary;",
  "  return (",
  '    <Card className="border-[#b99b5f]/20 bg-[#b99b5f]/[0.03]">',
  '      <div className="flex flex-wrap items-center justify-between gap-2">',
  '        <h2 className="text-lg font-semibold text-[#f4efe5]">{extra.discountQuality}</h2>',
  "        <Badge>{quality.methodVersion}</Badge>",
  "      </div>",
  '      <p className="mt-2 text-xs leading-5 text-[#9aa7b8]">',
  '        {locale === "sv" ? "Låg P/E klassas inte automatiskt som billig. StockBox testar om fundamenta har försämrats med en versionerad regelmotor." : "A low P/E is not treated as automatically cheap. StockBox tests whether fundamentals have deteriorated using a versioned rule set."}',
  "      </p>",
  '      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">',
  "        <Stat label={copy.classification} value={quality.classification ?? extra.notApplicable} />",
  "        <Stat label={extra.discountVsHistoricalMedian} value={formatPercent(quality.discountToReferenceMedian, locale, copy.unavailable)} />",
  "        <Stat label={extra.evidenceCoverage} value={formatPercent(quality.coverage, locale, copy.unavailable)} />",
  "        <Stat label={extra.deteriorationScore} value={formatPercent(quality.deteriorationScore, locale, copy.unavailable)} />",
  "      </div>",
  '      <p className="mt-3 text-sm leading-6 text-[#c9d2df]">{summary}</p>',
  "      {warnings.length ? (",
  '        <div className="mt-3 flex flex-wrap gap-2" aria-label={extra.signalEvidence}>',
  "          {warnings.map((signal) => (",
  "            <Badge key={signal.key}>{signal.label}: {signal.status}</Badge>",
  "          ))}",
  "        </div>",
  "      ) : null}",
  '      <p className="mt-3 text-xs text-[#7f8da0]">',
  "        {quality.evaluatedSignalCount}/{quality.applicableSignalCount} {extra.signalEvidence.toLowerCase()} · {quality.referenceWindow ?? copy.unavailable}",
  "      </p>",
  "    </Card>",
  "  );",
  "}",
  "",
  "function GrowthHistory({ report, locale }: { report: AnalysisReport; locale: Locale }) {",
  "",
].join("\n");
ui = replaceOnce(
  ui,
  "function GrowthHistory({ report, locale }: { report: AnalysisReport; locale: Locale }) {\n",
  cardLines,
  "ui: add discount quality card",
);
ui = replaceOnce(
  ui,
  '      <HistoricalOverview report={report} locale={locale} />\n      {mode === "pro" ? (\n',
  '      <HistoricalOverview report={report} locale={locale} />\n      <HistoricalDiscountQualityCard report={report} locale={locale} />\n      {mode === "pro" ? (\n',
  "ui: render discount quality card in simple and pro",
);
requireContains(ui, "Historical Discount Quality", "ui");
requireContains(ui, "<HistoricalDiscountQualityCard report={report} locale={locale} />", "ui");
write(uiPath, ui);

const exportPath = "src/lib/analysis/financial-data-export.ts";
let exportFile = read(exportPath);
const oldExportTail = [
  "  const valuationSection = valuationRows.length",
  "    ? [",
  '        "",',
  "        `historicalValuationMethodVersion,${csvCell(historical.valuationMethodVersion)}` ,".replace(" ` ,", "`,"),
  '        valuationHeaders.join(","),',
  "        ...valuationRows,",
  "      ]",
  "    : [];",
  '  return [historicalHeaders.join(","), ...rows, ...valuationSection].join("\\n");'.replace("\\\\n", "\\n"),
  "",
].join("\n");
const newExportTail = [
  "  const valuationSection = valuationRows.length",
  "    ? [",
  '        "",',
  '        ["historicalValuationMethodVersion", csvCell(historical.valuationMethodVersion)].join(","),',
  '        valuationHeaders.join(","),',
  "        ...valuationRows,",
  "      ]",
  "    : [];",
  "  const quality = historical.discountQuality;",
  "  const discountQualitySection = quality",
  "    ? [",
  '        "",',
  '        "historicalDiscountQuality",',
  '        ["methodVersion", csvCell(quality.methodVersion)].join(","),',
  '        ["status", csvCell(quality.status)].join(","),',
  '        ["classification", csvCell(quality.classification)].join(","),',
  '        ["discountToReferenceMedian", csvCell(quality.discountToReferenceMedian)].join(","),',
  '        ["referenceWindow", csvCell(quality.referenceWindow)].join(","),',
  '        ["evidenceCoverage", csvCell(quality.coverage)].join(","),',
  '        ["deteriorationScore", csvCell(quality.deteriorationScore)].join(","),',
  '        ["evaluatedSignalCount", csvCell(quality.evaluatedSignalCount)].join(","),',
  '        ["applicableSignalCount", csvCell(quality.applicableSignalCount)].join(","),',
  '        ["summary", csvCell(quality.summary)].join(","),',
  '        "signalKey,signalLabel,signalStatus,signalValue,signalWeight,signalDetail",',
  "        ...quality.signals.map((signal) => [",
  "          signal.key, signal.label, signal.status, signal.value, signal.weight, signal.detail,",
  '        ].map(csvCell).join(",")),',
  "      ]",
  "    : [];",
  '  return [historicalHeaders.join(","), ...rows, ...valuationSection, ...discountQualitySection].join("\\n");'.replace("\\\\n", "\\n"),
  "",
].join("\n");
exportFile = replaceOnce(exportFile, oldExportTail, newExportTail, "export: append discount quality section");
requireContains(exportFile, "historicalDiscountQuality", "export");
write(exportPath, exportFile);

console.log("Low P/E historical discount quality P0 patch applied with all guards satisfied.");
