import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getEarningsEstimateIntelligence } from "@/lib/investor-intelligence/earnings-estimates-service";

export type EarningsEstimateData = NonNullable<Awaited<ReturnType<typeof getEarningsEstimateIntelligence>>>;

function pct(value: number | null | undefined) { return typeof value === "number" && Number.isFinite(value) ? `${value >= 0 ? "+" : ""}${(value*100).toFixed(1)}%` : "—"; }
function number(value: number | null | undefined) { return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString(undefined,{maximumFractionDigits:2}) : "—"; }

export function EarningsEstimateIntelligence({ data }: { data: EarningsEstimateData }) {
  const earnings = data.earnings;
  const estimates = data.estimates;
  return <div className="grid gap-5 lg:grid-cols-2">
    <Card><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-[#e1cb95]">EARNINGS INTELLIGENCE</p><h2 className="mt-1 text-lg font-semibold text-[#f4efe5]">Latest structured earnings event</h2></div><Badge>{earnings ? earnings.provider : "data unavailable"}</Badge></div>
      {earnings ? <><p className="mt-2 text-xs text-[#9aa7b8]">{earnings.fiscalQuarter ?? "Quarter unavailable"} {earnings.fiscalYear ?? ""} · {earnings.eventDate ? new Date(earnings.eventDate).toLocaleDateString() : "date unavailable"}</p><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><span className="text-[#9aa7b8]">Revenue reported</span><p className="number font-semibold">{number(earnings.reportedRevenue)}</p></div><div><span className="text-[#9aa7b8]">Revenue expected</span><p className="number font-semibold">{number(earnings.estimatedRevenue)}</p></div><div><span className="text-[#9aa7b8]">EPS reported</span><p className="number font-semibold">{number(earnings.reportedEps)}</p></div><div><span className="text-[#9aa7b8]">EPS expected</span><p className="number font-semibold">{number(earnings.estimatedEps)}</p></div></div><div className="mt-4 space-y-2">{earnings.interpretation.statements.length ? earnings.interpretation.statements.map((statement)=><p key={statement} className="text-sm leading-6 text-[#c9d2df]">{statement}</p>) : <p className="text-sm text-[#748196]">The event exists, but comparable estimate/prior-period inputs are insufficient for deterministic interpretation.</p>}</div></> : <p className="mt-4 text-sm leading-6 text-[#9aa7b8]">No source-backed earnings event has been ingested for this company. StockBox will not infer a beat/miss or upcoming date without provider evidence.</p>}
    </Card>
    <Card><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-[#e1cb95]">ESTIMATE REVISION TRACKING</p><h2 className="mt-1 text-lg font-semibold text-[#f4efe5]">Consensus momentum</h2></div><Badge>{estimates?.momentum.label ?? "data unavailable"}</Badge></div>
      {estimates ? <><p className="mt-3 text-sm text-[#c9d2df]">{estimates.momentum.explanation}</p><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="text-[#e1cb95]"><th className="py-2">Metric</th><th>7D</th><th>30D</th><th>90D</th></tr></thead><tbody>{[["Revenue",estimates.revenue],["EPS",estimates.eps],["Target",estimates.target]].map(([label,metric]) => { const m=metric as typeof estimates.revenue; return <tr key={String(label)} className="border-t border-white/10"><td className="py-2 text-[#f4efe5]">{String(label)}</td><td>{pct(m.days7?.change)}</td><td>{pct(m.days30?.change)}</td><td>{pct(m.days90?.change)}</td></tr>; })}</tbody></table></div></> : <p className="mt-4 text-sm leading-6 text-[#9aa7b8]">No historical consensus snapshots are available. Estimate momentum remains unavailable rather than being synthesized from price or fundamentals.</p>}
    </Card>
  </div>;
}
