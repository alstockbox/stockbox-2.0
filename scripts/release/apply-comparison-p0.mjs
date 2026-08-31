import fs from "node:fs";

function read(path) { return fs.readFileSync(path, "utf8"); }
function write(path, value) { fs.writeFileSync(path, value, "utf8"); }
function replaceOnce(content, search, replacement, label) {
  const count = content.split(search).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match, found ${count}`);
  return content.replace(search, replacement);
}
function requireContains(content, needle, label) {
  if (!content.includes(needle)) throw new Error(`${label}: missing postcondition ${needle}`);
}

const comparisonPath = "src/lib/analysis/comparison.ts";
let comparison = read(comparisonPath);
const functionStart = comparison.indexOf("export function objectiveDifferences(");
if (functionStart < 0) throw new Error("comparison: objectiveDifferences start not found");
const prefix = comparison.slice(0, functionStart);
const replacement = [
  'export function objectiveDifferences(reports: AnalysisReport[], locale: "en" | "sv" = "en") {',
  '  if (reports.length < 2 || reports.length > 5) return [] as string[];',
  '  const out: string[] = [];',
  '',
  '  const observations: Array<{ label: string; group: ComparisonGroup["id"]; key: string; direction: "higher" | "lower" }> = [',
  '    { label: "operating margin", group: "profitability", key: "operatingMargin", direction: "higher" },',
  '    { label: "revenue growth", group: "growth", key: "revenueGrowth", direction: "higher" },',
  '    { label: "ROIC", group: "profitability", key: "roic", direction: "higher" },',
  '    { label: "net debt / EBITDA", group: "financialHealth", key: "netDebtEbitda", direction: "lower" },',
  '  ];',
  '',
  '  for (const observation of observations) {',
  '    const available = reports.flatMap((report) => {',
  '      const value = metric(report, observation.group, observation.key);',
  '      return finite(value) ? [{ report, value }] : [];',
  '    });',
  '    if (available.length < 2) continue;',
  '    const values = available.map((item) => item.value);',
  '    if (Math.max(...values) - Math.min(...values) < 1e-9) continue;',
  '    const standout = [...available].sort((left, right) => observation.direction === "higher" ? right.value - left.value : left.value - right.value)[0];',
  '    if (reports.length === 2) {',
  '      out.push(locale === "sv"',
  '        ? `${standout.report.ticker} har ${observation.direction === "higher" ? "högre" : "lägre"} ${observation.label} i de valda rapportsnapshotsen.`',
  '        : `${standout.report.ticker} has the ${observation.direction} ${observation.label} in the selected report snapshots.`);',
  '    } else {',
  '      out.push(locale === "sv"',
  '        ? `${standout.report.ticker} har ${observation.direction === "higher" ? "högst" : "lägst"} ${observation.label} bland de valda rapportsnapshotsen.`',
  '        : `${standout.report.ticker} has the ${observation.direction === "higher" ? "highest" : "lowest"} ${observation.label} among the selected report snapshots.`);',
  '    }',
  '  }',
  '',
  '  if (reports.length === 2) {',
  '    const [left, right] = reports;',
  '    const leftPe = metric(left, "valuation", "pe");',
  '    const rightPe = metric(right, "valuation", "pe");',
  '    if (finite(leftPe) && finite(rightPe) && Math.abs(leftPe - rightPe) >= 1e-9) {',
  '      out.push(locale === "sv"',
  '        ? `P/E skiljer sig mellan ${left.ticker} (${leftPe.toFixed(1)}×) och ${right.ticker} (${rightPe.toFixed(1)}×); lägre P/E behandlas inte som bättre utan historisk och fundamental kontext.`',
  '        : `P/E differs between ${left.ticker} (${leftPe.toFixed(1)}×) and ${right.ticker} (${rightPe.toFixed(1)}×); the lower P/E is not treated as better without historical and fundamental context.`);',
  '    }',
  '  }',
  '',
  '  return out.slice(0, 5);',
  '}',
  '',
].join("\n");
comparison = prefix + replacement;
requireContains(comparison, "the lower P/E is not treated as better", "comparison");
requireContains(comparison, "reports.length > 5", "comparison");
write(comparisonPath, comparison);

const pickerPath = "src/components/analysis/comparison-picker.tsx";
let picker = read(pickerPath);
picker = replaceOnce(picker, "if (current.length >= 3) return current;", "if (current.length >= 5) return current;", "picker max selection");
picker = replaceOnce(picker, "Select up to three snapshots.", "Select up to five snapshots.", "picker English copy");
picker = replaceOnce(picker, "Välj upp till tre snapshots.", "Välj upp till fem snapshots.", "picker Swedish copy");
picker = replaceOnce(picker, "{selectedIds.length}/3", "{selectedIds.length}/5", "picker counter");
picker = replaceOnce(picker, "selectedIds.length >= 3", "selectedIds.length >= 5", "picker disable cap");
requireContains(picker, "Select up to five snapshots", "picker");
write(pickerPath, picker);

const pagePath = "src/app/compare/page.tsx";
let page = read(pagePath);
page = replaceOnce(page, "const ids = allIds.slice(0, 3);", "const ids = allIds.slice(0, 5);", "page selection cap");
page = replaceOnce(
  page,
  '{allIds.length > 3 ? <p className="mt-3 text-sm text-amber-200">{sv ? "Max tre rapporter stöds. Endast de tre första valen används." : "A maximum of three reports is supported. Only the first three selections are used."}</p> : null}',
  '{allIds.length > 5 ? <p className="mt-3 text-sm text-amber-200">{sv ? "Max fem rapporter stöds. Endast de fem första valen används." : "A maximum of five reports is supported. Only the first five selections are used."}</p> : null}',
  "page max warning",
);
page = replaceOnce(
  page,
  'function reportGridClass(count: number) {\n  if (count === 2) return "grid grid-cols-2 gap-2";\n  return "grid grid-cols-1 gap-2 min-[390px]:grid-cols-3";\n}',
  'function reportGridClass(count: number) {\n  if (count === 2) return "grid grid-cols-2 gap-2";\n  if (count === 3) return "grid grid-cols-1 gap-2 min-[390px]:grid-cols-3";\n  return "grid grid-cols-1 gap-2 min-[390px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5";\n}',
  "page responsive grid",
);
page = replaceOnce(
  page,
  '<div className={reports.length === 2 ? "grid gap-0 md:grid-cols-[1fr_auto_1fr]" : "grid gap-0 md:grid-cols-3"}>',
  '<div className={reports.length === 2 ? "grid gap-0 md:grid-cols-[1fr_auto_1fr]" : reportGridClass(reports.length)}>',
  "page snapshot grid",
);
page = replaceOnce(
  page,
  '{reports.length === 2 ? <Card>\n        <h2 className="text-xl font-semibold text-[#f4efe5]">{sv ? "Vad sticker ut?" : "What stands out"}</h2>\n        <p className="mt-2 text-xs leading-5 text-[#9aa7b8]">{sv ? "Endast objektiva skillnader från numeriska canonical metrics i de två valda snapshotsen visas." : "Only objective differences from numeric canonical metrics in the two selected snapshots are shown."}</p>',
  '{reports.length >= 2 ? <Card>\n        <h2 className="text-xl font-semibold text-[#f4efe5]">{sv ? "Vad sticker ut?" : "What stands out"}</h2>\n        <p className="mt-2 text-xs leading-5 text-[#9aa7b8]">{sv ? "Endast faktiska skillnader från numeriska canonical metrics i de valda snapshotsen visas. Lägre värderingsmultiplar behandlas inte automatiskt som bättre." : "Only factual differences from numeric canonical metrics in the selected snapshots are shown. Lower valuation multiples are not automatically treated as better."}</p>',
  "page what stands out range",
);
page = replaceOnce(page, "{reports.length < 3 ? <Link", "{reports.length < 5 ? <Link", "page add report cap");
requireContains(page, "allIds.slice(0, 5)", "page");
requireContains(page, "A maximum of five reports is supported", "page");
write(pagePath, page);

console.log("Comparison P0 patch applied with all guards satisfied.");
