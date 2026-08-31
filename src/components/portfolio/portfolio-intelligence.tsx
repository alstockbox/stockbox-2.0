import { Card } from "@/components/ui/card";
import { buildPortfolioIntelligence } from "@/lib/investor-intelligence/portfolio";

type Data = ReturnType<typeof buildPortfolioIntelligence>;
function pct(value:number|null|undefined){return typeof value==="number"&&Number.isFinite(value)?`${(value*100).toFixed(1)}%`:"—";}
function score(value:number|null|undefined){return typeof value==="number"&&Number.isFinite(value)?`${Math.round(value)}/100`:"—";}
function num(value:number|null|undefined){return typeof value==="number"&&Number.isFinite(value)?value.toFixed(1):"—";}

export function PortfolioIntelligencePanel({data}:{data:Data|undefined}){
  if(!data)return null;
  return <Card className="mt-4 border-[#b99b5f]/20 bg-[#b99b5f]/5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold text-[#e1cb95]">PORTFOLIO INTELLIGENCE V2</p><h3 className="mt-1 text-lg font-semibold text-[#f4efe5]">Weighted portfolio characteristics</h3></div><span className="text-xs text-[#9aa7b8]">Coverage {pct(data.coverage.marketValueCoverage)}</span></div>
    <p className="mt-2 text-xs leading-5 text-[#748196]">{data.coverage.note}</p>
    <div className="mt-4 grid gap-2 grid-cols-2 md:grid-cols-4 xl:grid-cols-7">{[["StockBox",score(data.scores.stockBox)],["Quality",score(data.scores.quality)],["Valuation",score(data.scores.valuation)],["Growth",score(data.scores.growth)],["Health",score(data.scores.financialHealth)],["Risk",score(data.scores.risk)],["FCF yield",pct(data.characteristics.fcfYield)]].map(([label,value])=><div key={label} className="rounded-md border border-white/10 bg-[#07111f]/60 p-3"><p className="text-[11px] text-[#9aa7b8]">{label}</p><p className="number mt-1 font-semibold text-[#f4efe5]">{value}</p></div>)}</div>
    <div className="mt-5 grid gap-5 lg:grid-cols-3">
      <div><h4 className="text-sm font-semibold text-[#f4efe5]">Concentration</h4><div className="mt-2 space-y-1 text-xs text-[#c9d2df]"><p>Top holding: {pct(data.concentration.topHolding)}</p><p>Top 3: {pct(data.concentration.top3)}</p><p>Top 5: {pct(data.concentration.top5)}</p><p>Historical P/E ≥75th percentile: {pct(data.concentration.highValuationWeight)}</p><p>Net debt/EBITDA ≥3x: {pct(data.concentration.highLeverageWeight)}</p></div></div>
      <div><h4 className="text-sm font-semibold text-[#f4efe5]">Sector exposure</h4><div className="mt-2 space-y-1 text-xs text-[#c9d2df]">{data.exposures.sector.slice(0,6).map((item)=><p key={item.label}>{item.label}: {pct(item.weight)}</p>)}</div></div>
      <div><h4 className="text-sm font-semibold text-[#f4efe5]">Company characteristics</h4><div className="mt-2 space-y-1 text-xs text-[#c9d2df]"><p>P/E: {num(data.characteristics.pe)}×</p><p>Revenue growth: {pct(data.characteristics.revenueGrowth)}</p><p>ROIC: {pct(data.characteristics.roic)}</p><p>Fair-value upside: {pct(data.characteristics.fairValueUpside)}</p></div></div>
    </div>
    {data.excludedPositions.length?<details className="mt-4"><summary className="cursor-pointer text-xs font-semibold text-[#e1cb95]">{data.excludedPositions.length} position(s) excluded from weighting</summary><div className="mt-2 text-xs text-[#9aa7b8]">{data.excludedPositions.map((item)=><p key={item.ticker}>{item.ticker}: {item.reason} Holding {item.holdingCurrency}, catalog {item.catalogCurrency??"unknown"}.</p>)}</div></details>:null}
  </Card>;
}
