import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { AwaitedReturn } from "@/lib/utils/types";
import { getPeerIntelligence } from "@/lib/investor-intelligence/peer-service";

export type PeerIntelligenceData = NonNullable<AwaitedReturn<typeof getPeerIntelligence>>;

function formatMetric(key: string, value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  if (key.includes("Margin") || key.includes("Growth") || key.endsWith("roic") || key.endsWith("roe") || key.includes("Yield")) return `${(value * 100).toFixed(1)}%`;
  if (key === "score") return `${Math.round(value)}/100`;
  return `${value.toFixed(1)}×`;
}

export function RealPeerIntelligence({ data }: { data: PeerIntelligenceData | null }) {
  if (!data) return <Card><h2 className="text-lg font-semibold text-[#f4efe5]">Real Peer Intelligence</h2><p className="mt-2 text-sm text-[#9aa7b8]">Peer comparison is unavailable until enough compatible companies have been analyzed into the StockBox catalog.</p></Card>;
  return <Card>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold text-[#e1cb95]">REAL PEER INTELLIGENCE</p><h2 className="mt-1 text-xl font-semibold text-[#f4efe5]">Comparable companies, not a static sector benchmark</h2><p className="mt-2 max-w-3xl text-sm text-[#9aa7b8]">Peers are selected from actual StockBox-analyzed companies using industry when available, then sector, business archetype and market-cap similarity. Missing metrics are excluded from each peer statistic.</p></div><Badge>{data.peers.length} peers</Badge></div>
    <div className="mt-4 flex flex-wrap gap-2">{data.peers.map((peer) => <Badge key={peer.ticker}>{peer.ticker}</Badge>)}</div>
    <div className="mt-5 overflow-x-auto rounded-md border border-white/10"><table className="min-w-[850px] w-full text-left text-xs"><thead><tr className="text-[#e1cb95]">{["Metric",data.target.ticker,"Peer median","Peer average","Premium / discount","Rank"].map((h)=><th key={h} className="border-b border-white/10 px-3 py-2">{h}</th>)}</tr></thead><tbody>{data.comparison.map((row)=><tr key={row.key} className="border-b border-white/5 text-[#c9d2df]"><td className="px-3 py-2 text-[#f4efe5]">{row.label}</td><td className="px-3 py-2">{formatMetric(row.key,row.companyValue)}</td><td className="px-3 py-2">{formatMetric(row.key,row.peerMedian)}</td><td className="px-3 py-2">{formatMetric(row.key,row.peerAverage)}</td><td className="px-3 py-2">{row.premiumDiscount === null ? "—" : `${row.premiumDiscount >= 0 ? "+" : ""}${(row.premiumDiscount*100).toFixed(1)}%`}</td><td className="px-3 py-2">{row.rank === null ? "—" : `${row.rank}/${row.rankOf}`}</td></tr>)}</tbody></table></div>
    <p className="mt-3 text-xs text-[#748196]">{data.userModified ? "Peer set was modified by the user." : "Automatic peer set."} This comparison is relative context and not a standalone valuation conclusion.</p>
  </Card>;
}
