import { readFileSync, writeFileSync } from "node:fs";

const path = "src/components/analysis/report-view.tsx";
let source = readFileSync(path, "utf8");

function replaceOnce(label, before, after) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  source = source.replace(before, after);
}

replaceOnce(
  "client imports",
  'import { AlertCircle, BarChart3, CalendarClock, CheckCircle2, Compass, Database, Eye, FileText, ShieldAlert, TrendingDown, TrendingUp } from "lucide-react";\nimport type { AnalysisReport, Flag, Metrics, ScoreContributor, UiMode } from "@/lib/analysis/types";',
  '"use client";\n\nimport { useMemo, useState } from "react";\nimport { AlertCircle, BarChart3, CalendarClock, CheckCircle2, Compass, Database, Eye, FileText, ShieldAlert, TrendingDown, TrendingUp } from "lucide-react";\nimport type { AnalysisReport, Flag, InvestmentProfile, Metrics, ScoreContributor, UiMode } from "@/lib/analysis/types";',
);

replaceOnce(
  "lens imports",
  'import { orderScoreDimensions, profilePresentationFor } from "@/lib/analysis/profile-presentation";',
  'import { orderScoreDimensions, profilePresentationFor } from "@/lib/analysis/profile-presentation";\nimport { applyAnalysisLens } from "@/lib/analysis/analysis-lens";\nimport { AnalysisLensControl } from "./analysis-lens-control";',
);

replaceOnce(
  "report view wrapper",
  'export function ReportView({ report, mode = "pro", locale = "en", previousReport = null }: { report: AnalysisReport; mode?: UiMode; locale?: Locale; previousReport?: AnalysisReport | null }) {\n  const copy = getP0Copy(locale).report;\n  const profilePresentation = profilePresentationFor(report.investmentProfile, locale);',
  'type ReportViewProps = { report: AnalysisReport; mode?: UiMode; locale?: Locale; previousReport?: AnalysisReport | null };\n\nexport function ReportView(props: ReportViewProps) {\n  return <ReportViewWithLens key={`${props.report.id}:${props.report.investmentProfile}`} {...props} />;\n}\n\nfunction ReportViewWithLens({ report: sourceReport, mode = "pro", locale = "en", previousReport = null }: ReportViewProps) {\n  const [analysisLens, setAnalysisLens] = useState<InvestmentProfile>(sourceReport.investmentProfile);\n  const report = useMemo(() => applyAnalysisLens(sourceReport, analysisLens), [sourceReport, analysisLens]);\n  const copy = getP0Copy(locale).report;\n  const profilePresentation = profilePresentationFor(report.investmentProfile, locale);',
);

replaceOnce(
  "lens control placement",
  '      ) : null}\n      <Card className="p-6">',
  '      ) : null}\n      <section aria-label={locale === "sv" ? "Investeringslins" : "Investment lens"}>\n        <AnalysisLensControl\n          value={analysisLens}\n          defaultProfile={sourceReport.investmentProfile}\n          lensScore={report.score.personalizedScore}\n          locale={locale}\n          onChange={setAnalysisLens}\n        />\n      </section>\n      <Card className="p-6">',
);

replaceOnce(
  "remove duplicate static lens box",
  '        <div className="mt-4 rounded-md border border-[#b99b5f]/20 bg-[#b99b5f]/5 p-4">\n          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#e1cb95]">{locale === "sv" ? "Investeringslins" : "Investment lens"} · {report.investmentProfile.replaceAll("_", " ")}</p>\n          <p className="mt-2 max-w-4xl text-sm leading-6 text-[#c9d2df]">{profilePresentation.description}</p>\n        </div>\n',
  '',
);

replaceOnce(
  "lens score label",
  '<Meter value={report.score.personalizedScore} label={copy.personalizedScore} />',
  '<Meter value={report.score.personalizedScore} label={locale === "sv" ? "Lins-poäng" : "Lens score"} />',
);

if (!source.startsWith('"use client";')) throw new Error("postcondition: ReportView must be a client component");
if (!source.includes("<AnalysisLensControl")) throw new Error("postcondition: lens control missing");
if (!source.includes('"Investment lens"')) throw new Error("postcondition: accessible investment lens label missing");
if (!source.includes("applyAnalysisLens(sourceReport, analysisLens)")) throw new Error("postcondition: lens derivation missing");
if (source.includes("saveInvestmentProfile")) throw new Error("postcondition: report view must not persist profile changes");

writeFileSync(path, source);
