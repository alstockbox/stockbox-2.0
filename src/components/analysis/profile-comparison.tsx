import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { AnalysisReport, ScoreDimensionKey } from "@/lib/analysis/types";
import { buildProfileScoreComparison } from "@/lib/investor-intelligence/profile-comparison";

const labels:Record<ScoreDimensionKey,string>={growth:"Growth",profitability:"Profitability",financialHealth:"Financial health",valuation:"Valuation",cashFlow:"Cash flow",earningsQuality:"Earnings quality",quality:"Quality",momentum:"Momentum",risk:"Risk"};

export function ProfileComparison({report}:{report:AnalysisReport}){
  const engine=report.engine;
  if(!engine)return null;
  const dimensions=Object.fromEntries(Object.entries(engine.scores.dimensions).map(([key,value])=>[key,value.score])) as Partial<Record<ScoreDimensionKey,number|null>>;
  const rows=buildProfileScoreComparison({sector:engine.scores.sector,dimensions});
  return <Card>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold text-[#e1cb95]">INVESTMENT PROFILE UX V2</p><h2 className="mt-1 text-xl font-semibold text-[#f4efe5]">How the same company scores for different investors</h2><p className="mt-2 max-w-3xl text-sm text-[#9aa7b8]">Uses StockBox’s existing sector-adjusted profile weights. Scores below are recalculated from the same available dimension scores; missing dimensions are not replaced.</p></div><Badge>Current: {report.investmentProfile}</Badge></div>
    <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{rows.map((row)=><div key={row.profile} className={`rounded-md border p-4 ${row.profile===report.investmentProfile?"border-[#b99b5f]/50 bg-[#b99b5f]/10":"border-white/10 bg-white/5"}`}><div className="flex items-center justify-between gap-2"><p className="font-semibold capitalize text-[#f4efe5]">{row.profile.replaceAll("_"," ")}</p><p className="number text-xl font-semibold text-[#e1cb95]">{row.score===null?"—":Math.round(row.score)}</p></div><div className="mt-3 space-y-1 text-xs text-[#9aa7b8]">{row.topWeights.map((driver)=><p key={driver.key}>{labels[driver.key]} · {(driver.weight*100).toFixed(0)}% weight · {driver.score===null?"missing":`${Math.round(driver.score)}/100`}</p>)}</div><p className="mt-2 text-[11px] text-[#748196]">Available weight {(row.coverageWeight*100).toFixed(0)}%</p></div>)}</div>
  </Card>;
}
