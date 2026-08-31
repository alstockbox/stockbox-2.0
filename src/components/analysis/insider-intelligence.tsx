import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getInsiderIntelligence } from "@/lib/investor-intelligence/insider-service";

export type InsiderIntelligenceData=Awaited<ReturnType<typeof getInsiderIntelligence>>;
function money(value:number|null){return typeof value==="number"&&Number.isFinite(value)?value.toLocaleString(undefined,{style:"currency",currency:"USD",maximumFractionDigits:0}):"—";}

export function InsiderIntelligence({data}:{data:InsiderIntelligenceData}){
  return <Card>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold text-[#e1cb95]">INSIDER & OWNERSHIP INTELLIGENCE</p><h2 className="mt-1 text-xl font-semibold text-[#f4efe5]">SEC Form 4 transactions</h2><p className="mt-2 max-w-3xl text-sm text-[#9aa7b8]">US insider transactions are read from SEC EDGAR Form 4 filings. StockBox does not infer sentiment from missing filings and does not fabricate ownership percentages.</p></div><Badge>{data.status}</Badge></div>
    {data.status==="available"&&data.transactions.length?<div className="mt-5 overflow-x-auto rounded-md border border-white/10"><table className="min-w-[850px] w-full text-left text-xs"><thead><tr className="text-[#e1cb95]">{["Date","Type","Role","Shares","Transaction value","10b5-1","Source"].map((h)=><th key={h} className="border-b border-white/10 px-3 py-2">{h}</th>)}</tr></thead><tbody>{data.transactions.map((item,index)=><tr key={`${item.date}-${index}`} className="border-b border-white/5 text-[#c9d2df]"><td className="px-3 py-2">{item.date}</td><td className={`px-3 py-2 ${item.transactionType==="open_market_buy"?"text-emerald-300":item.transactionType==="open_market_sell"?"text-red-300":""}`}>{item.transactionType.replaceAll("_"," ")}</td><td className="px-3 py-2">{item.insiderRole??"—"}</td><td className="px-3 py-2">{item.shares?.toLocaleString()??"—"}</td><td className="px-3 py-2">{money(item.value)}</td><td className="px-3 py-2">{item.automaticPlan?"Detected in filing":"Not detected"}</td><td className="px-3 py-2">{item.evidence?<a className="text-[#e1cb95]" href={item.evidence.source.url} target="_blank" rel="noreferrer">SEC Form 4</a>:"SEC"}</td></tr>)}</tbody></table></div>:<p className="mt-4 text-sm text-[#9aa7b8]">{data.reason??"No recent supported Form 4 transactions were returned."}</p>}
    <p className="mt-3 text-xs text-[#748196]">Institutional ownership and non-US insider feeds remain unavailable until a reliable provider is connected.</p>
  </Card>;
}
