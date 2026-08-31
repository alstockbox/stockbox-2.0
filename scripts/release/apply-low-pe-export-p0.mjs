import fs from "node:fs";

const path = "src/lib/analysis/financial-data-export.ts";
let content = fs.readFileSync(path, "utf8");

function replaceOnce(search, replacement, label) {
  const count = content.split(search).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  content = content.replace(search, replacement);
}

replaceOnce(
  '  return [historicalHeaders.join(","), ...rows, ...valuationSection].join("\\n");',
  [
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
    '  return [historicalHeaders.join(","), ...rows, ...valuationSection, ...discountQualitySection].join("\\n");',
  ].join("\n"),
  "export: append discount quality section",
);

if (!content.includes("historicalDiscountQuality")) throw new Error("export: postcondition missing");
fs.writeFileSync(path, content, "utf8");
console.log("Historical discount quality CSV export patch applied.");
