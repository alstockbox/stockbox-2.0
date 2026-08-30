import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, Container, Section } from "@/components/ui/card";
import { getLocale } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Apple AAPL Sample Analysis",
  description: "A real StockBox production-engine snapshot for Apple showing score, model rating, confidence, coverage and research dimensions.",
};

const snapshot = {
  company: "Apple Inc.", ticker: "AAPL", score: 66.5, recommendation: "Hold",
  confidence: 90, coverage: 89.7, engine: "stockbox-analysis-engine-v2.7.0",
  generatedAt: "30 Aug 2026, 12:56 UTC",
  dimensions: [
    ["Valuation", 28], ["Growth", 36], ["Profitability", 85],
    ["Financial health", 69], ["Business quality", 100], ["Risk resilience", 56],
  ] as const,
};

export default async function SampleAnalysisPage() {
  const locale = await getLocale();
  const sv = locale === "sv";
  return <Section><Container className="max-w-5xl">
    <p className="text-sm font-semibold text-[#e1cb95]">{sv ? "Riktig produktionssnapshot" : "Real production snapshot"}</p>
    <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="serif text-4xl font-semibold">{snapshot.company} <span className="font-mono text-2xl text-[#9aa7b8]">{snapshot.ticker}</span></h1><p className="mt-3 text-sm text-[#9aa7b8]">{sv ? "Genererad" : "Generated"} {snapshot.generatedAt} · {snapshot.engine}</p></div>
      <Badge>{snapshot.recommendation}</Badge>
    </div>
    <div className="mt-8 grid gap-4 sm:grid-cols-3">
      <Card><p className="text-xs uppercase tracking-wide text-[#9aa7b8]">StockBox Score</p><p className="number mt-2 text-4xl font-semibold text-[#f4efe5]">{snapshot.score.toFixed(1)}</p><p className="mt-1 text-xs text-[#9aa7b8]">/100</p></Card>
      <Card><p className="text-xs uppercase tracking-wide text-[#9aa7b8]">{sv ? "Konfidens" : "Confidence"}</p><p className="number mt-2 text-4xl font-semibold text-[#f4efe5]">{snapshot.confidence}%</p></Card>
      <Card><p className="text-xs uppercase tracking-wide text-[#9aa7b8]">{sv ? "Datatäckning" : "Data coverage"}</p><p className="number mt-2 text-4xl font-semibold text-[#f4efe5]">{snapshot.coverage}%</p></Card>
    </div>
    <Card className="mt-5">
      <h2 className="text-lg font-semibold text-[#f4efe5]">{sv ? "Modellbedömning" : "Model assessment"}</h2>
      <p className="mt-3 text-sm leading-7 text-[#c9d2df]">Apple Inc. receives a Hold model rating with a StockBox Score of 67/100 and 90% confidence.</p>
      <p className="mt-3 text-xs leading-6 text-[#9aa7b8]">{sv ? "Detta är en historisk snapshot av en verklig StockBox-analys, inte en aktuell rekommendation och inte individanpassad finansiell rådgivning." : "This is a historical snapshot of a real StockBox analysis, not a current recommendation and not individualized financial advice."}</p>
    </Card>
    <div className="mt-5 grid gap-3 md:grid-cols-2">
      {snapshot.dimensions.map(([label, score]) => <div key={label} className="rounded-lg border border-white/10 bg-white/[0.03] p-4"><div className="flex items-center justify-between gap-3"><span className="font-semibold text-[#f4efe5]">{label}</span><span className="number text-[#e1cb95]">{score}/100</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-[#b99b5f]" style={{ width: `${score}%` }} /></div></div>)}
    </div>
    <div className="mt-8 flex flex-wrap gap-3">
      <Link href="/auth/signup" className="rounded-md bg-[#b99b5f] px-4 py-2.5 text-sm font-semibold text-[#07111f]">{sv ? "Analysera gratis" : "Analyze free"}</Link>
      <Link href="/docs/methodology" className="rounded-md border border-white/15 px-4 py-2.5 text-sm font-semibold text-[#f4efe5] hover:bg-white/5">{sv ? "Läs metodiken" : "Read methodology"}</Link>
      <Link href="/data-sources" className="rounded-md border border-white/15 px-4 py-2.5 text-sm font-semibold text-[#f4efe5] hover:bg-white/5">{sv ? "Se datakällor" : "View data sources"}</Link>
    </div>
  </Container></Section>;
}
