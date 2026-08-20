import { AlertCircle, CheckCircle2, FileText, ShieldAlert } from "lucide-react";
import type { AnalysisReport, Flag, Metrics, UiMode } from "@/lib/analysis/types";
import { formatCompactCurrency, formatNumber, formatPercent } from "@/lib/utils/format";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Meter } from "@/components/ui/meter";
import { ScoreChart } from "./score-chart";

const metricLabels: Record<keyof Metrics, string> = {
  revenueGrowth1y: "Revenue growth 1Y",
  revenueCagr3y: "Revenue CAGR 3Y",
  epsGrowth1y: "EPS growth 1Y",
  grossMargin: "Gross margin",
  operatingMargin: "Operating margin",
  netMargin: "Net margin",
  fcf: "Free cash flow",
  fcfMargin: "FCF margin",
  cashConversion: "Cash conversion",
  debtToEquity: "Debt / equity",
  debtToAssets: "Debt / assets",
  netDebt: "Net debt",
  interestCoverage: "Interest coverage",
  earningsYield: "Earnings yield",
  fcfYield: "FCF yield",
  priceMomentum1y: "Price momentum 1Y",
  priceMomentum3m: "Price momentum 3M"
};

function formatMetric(key: keyof Metrics, value: number | null) {
  if (value === null) return "Unavailable";
  if (["fcf", "netDebt"].includes(key)) return formatCompactCurrency(value);
  if (
    [
      "revenueGrowth1y",
      "revenueCagr3y",
      "epsGrowth1y",
      "grossMargin",
      "operatingMargin",
      "netMargin",
      "fcfMargin",
      "earningsYield",
      "fcfYield",
      "priceMomentum1y",
      "priceMomentum3m",
      "debtToAssets"
    ].includes(key)
  ) {
    return formatPercent(value);
  }
  return formatNumber(value, { maximumFractionDigits: 2 });
}

function FlagList({ flags, tone }: { flags: Flag[]; tone: "red" | "green" }) {
  const Icon = tone === "red" ? AlertCircle : CheckCircle2;
  return (
    <div className="space-y-3">
      {flags.length ? (
        flags.map((flag) => (
          <div key={`${flag.title}-${flag.metric}`} className="rounded-md border border-white/10 bg-white/5 p-3">
            <div className="flex items-center gap-2">
              <Icon
                className={tone === "red" ? "h-4 w-4 text-red-300" : "h-4 w-4 text-emerald-300"}
                aria-hidden="true"
              />
              <p className="text-sm font-semibold text-[#f4efe5]">{flag.title}</p>
              <Badge className="ml-auto">{flag.severity}</Badge>
            </div>
            <p className="mt-2 text-sm leading-6 text-[#c9d2df]">{flag.detail}</p>
          </div>
        ))
      ) : (
        <p className="text-sm text-[#9aa7b8]">No deterministic flags detected from available data.</p>
      )}
    </div>
  );
}

export function ReportView({ report, mode = "pro" }: { report: AnalysisReport; mode?: UiMode }) {
  const showExplainability = mode === "pro" || report.analysisType === "deep";
  const showNumbers = mode === "pro" || report.analysisType !== "summary";
  const showValuation = mode === "pro" || report.analysisType === "deep";
  return (
    <div className="space-y-5">
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{report.ticker}</Badge>
              <Badge>{report.analysisType}</Badge>
              <Badge>{report.investmentProfile.replace("_", " ")}</Badge>
            </div>
            <h1 className="serif mt-4 text-3xl font-semibold text-[#f4efe5]">{report.companyName}</h1>
            <p className="mt-3 max-w-3xl text-lg leading-8 text-[#d6deea]">{report.oneSentence}</p>
          </div>
          <div className="grid min-w-56 grid-cols-2 gap-3 text-center">
            <div className="rounded-md border border-[#b99b5f]/30 bg-[#b99b5f]/10 p-4">
              <p className="text-xs text-[#e1cb95]">StockBox Score</p>
              <p className="number mt-1 text-4xl font-semibold text-[#f4efe5]">{report.score.score}</p>
            </div>
            <div className="rounded-md border border-white/10 bg-white/5 p-4">
              <p className="text-xs text-[#9aa7b8]">Confidence</p>
              <p className="number mt-1 text-4xl font-semibold text-[#f4efe5]">{report.score.confidence}%</p>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-[#f4efe5]">Model Assessment</h2>
            <Badge>{report.recommendation}</Badge>
          </div>
          <p className="mt-3 text-sm leading-6 text-[#c9d2df]">{report.summary}</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Meter value={report.score.score} label="General score" />
            <Meter value={report.score.personalizedScore} label="Personalized score" />
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-[#f4efe5]">60-Second View</h2>
          <dl className="mt-4 space-y-4 text-sm">
            <div>
              <dt className="font-semibold text-[#e1cb95]">Short term</dt>
              <dd className="mt-1 leading-6 text-[#c9d2df]">{report.shortTermAssessment}</dd>
            </div>
            <div>
              <dt className="font-semibold text-[#e1cb95]">Long term</dt>
              <dd className="mt-1 leading-6 text-[#c9d2df]">{report.longTermAssessment}</dd>
            </div>
          </dl>
        </Card>
      </div>

      {showExplainability ? <Card>
        <h2 className="text-lg font-semibold text-[#f4efe5]">Score Explainability</h2>
        <div className="mt-4 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <ScoreChart dimensions={report.score.dimensions} />
          <div className="space-y-3">
            {report.score.dimensions.map((dimension) => (
              <div key={dimension.key} className="rounded-md border border-white/10 bg-white/5 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-[#f4efe5]">{dimension.label}</p>
                  <p className="number text-sm text-[#e1cb95]">
                    {dimension.score === null ? "Unavailable" : Math.round(dimension.score)}
                  </p>
                </div>
                <p className="mt-1 text-xs leading-5 text-[#9aa7b8]">{dimension.rationale}</p>
              </div>
            ))}
          </div>
        </div>
      </Card> : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[#f4efe5]">
            <ShieldAlert className="h-5 w-5 text-red-300" aria-hidden="true" />
            Red Flags
          </h2>
          <FlagList flags={report.redFlags} tone="red" />
        </Card>
        <Card>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[#f4efe5]">
            <CheckCircle2 className="h-5 w-5 text-emerald-300" aria-hidden="true" />
            Green Flags
          </h2>
          <FlagList flags={report.greenFlags} tone="green" />
        </Card>
      </div>

      {showNumbers ? <Card>
        <h2 className="text-lg font-semibold text-[#f4efe5]">Numbers</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(report.metrics) as Array<keyof Metrics>).map((key) => (
            <div key={key} className="rounded-md border border-white/10 bg-white/5 p-3">
              <p className="text-xs text-[#9aa7b8]">{metricLabels[key]}</p>
              <p className="number mt-1 text-lg font-semibold text-[#f4efe5]">
                {formatMetric(key, report.metrics[key])}
              </p>
            </div>
          ))}
        </div>
      </Card> : null}

      <Card>
        <h2 className="text-lg font-semibold text-[#f4efe5]">Bull / Base / Bear</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {report.scenarios.map((scenario) => (
            <details key={scenario.caseName} className="rounded-md border border-white/10 bg-white/5 p-4" open={scenario.caseName === "Base"}>
              <summary className="cursor-pointer text-sm font-semibold text-[#f4efe5]">
                {scenario.caseName} case
              </summary>
              <p className="mt-3 text-sm leading-6 text-[#c9d2df]">{scenario.qualitativeOutcome}</p>
              <p className="mt-3 text-xs font-semibold text-[#e1cb95]">Assumptions</p>
              <ul className="mt-2 space-y-1 text-xs leading-5 text-[#9aa7b8]">
                {scenario.assumptions.map((assumption) => (
                  <li key={assumption}>{assumption}</li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </Card>

      {showValuation ? <Card>
        <h2 className="text-lg font-semibold text-[#f4efe5]">DCF / Intrinsic Value</h2>
        {report.dcf.suitable ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-white/10 bg-white/5 p-4">
              <p className="text-xs text-[#9aa7b8]">Bear</p>
              <p className="number mt-1 text-xl font-semibold text-[#f4efe5]">
                {formatCompactCurrency(report.dcf.bear)}
              </p>
            </div>
            <div className="rounded-md border border-[#b99b5f]/30 bg-[#b99b5f]/10 p-4">
              <p className="text-xs text-[#e1cb95]">Base</p>
              <p className="number mt-1 text-xl font-semibold text-[#f4efe5]">
                {formatCompactCurrency(report.dcf.base)}
              </p>
            </div>
            <div className="rounded-md border border-white/10 bg-white/5 p-4">
              <p className="text-xs text-[#9aa7b8]">Bull</p>
              <p className="number mt-1 text-xl font-semibold text-[#f4efe5]">
                {formatCompactCurrency(report.dcf.bull)}
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm leading-6 text-[#c9d2df]">{report.dcf.reason}</p>
        )}
      </Card> : null}

      <Card>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-[#f4efe5]">
          <FileText className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" />
          Sources and Data Freshness
        </h2>
        <div className="mt-4 space-y-3">
          {report.sources.length ? (
            report.sources.map((source) => (
              <a
                key={source.url}
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="block rounded-md border border-white/10 bg-white/5 p-3 text-sm hover:bg-white/8"
              >
                <span className="font-semibold text-[#f4efe5]">{source.name}</span>
                <span className="mt-1 block text-[#9aa7b8]">{source.freshness}</span>
              </a>
            ))
          ) : (
            <p className="text-sm text-[#9aa7b8]">No source was attached to this report.</p>
          )}
        </div>
        {report.score.missingData.length ? (
          <div className="mt-5 rounded-md border border-[#b99b5f]/20 bg-[#b99b5f]/10 p-3">
            <p className="text-sm font-semibold text-[#e1cb95]">Missing Data</p>
            <p className="mt-1 text-sm leading-6 text-[#c9d2df]">
              {report.score.missingData.slice(0, 10).join(", ")}
            </p>
          </div>
        ) : null}
        <p className="mt-5 text-xs leading-5 text-[#9aa7b8]">{report.disclaimer}</p>
      </Card>
    </div>
  );
}
