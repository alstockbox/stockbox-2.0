import type { Metadata } from "next";
import { Card, Container, Section } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { SCREENER_PRESETS } from "@/lib/investor-intelligence/screener";
import { getSavedScreeners, runScreener } from "@/lib/investor-intelligence/screener-service";
import { createClient } from "@/lib/supabase/server";
import { deleteSavedScreenerAction, runSavedScreenerAction, saveScreenerAction } from "./actions";

export const metadata: Metadata = { title: "Stock Screener" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ preset?: string; saved?: string; error?: string }> };

function pct(value: number | null | undefined) { return typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "—"; }
function num(value: number | null | undefined, digits = 1) { return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "—"; }

export default async function ScreenerPage({ searchParams }: Props) {
  const user = await requireUser();
  const params = await searchParams;
  const saved = await getSavedScreeners();
  const preset = SCREENER_PRESETS.find((item) => item.key === params.preset) ?? SCREENER_PRESETS[0];
  const selectedSaved = params.saved ? saved.find((item) => item.id === params.saved) : null;
  const definition = selectedSaved?.filters ?? preset.definition;
  const results = await runScreener(definition);
  const supabase = await createClient();
  const { data: latestSnapshots } = selectedSaved && supabase ? await supabase.from("screener_snapshots").select("entered_tickers,left_tickers,created_at").eq("saved_screener_id", selectedSaved.id).order("created_at", { ascending: false }).limit(1) : { data: [] };
  const delta = latestSnapshots?.[0];

  return <Section><Container className="max-w-[1500px]">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-[#e1cb95]">DISCOVERY INTELLIGENCE</p><h1 className="serif mt-2 text-3xl font-semibold text-[#f4efe5]">StockBox Screener</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-[#9aa7b8]">Filter the canonical StockBox company universe. A company is excluded when a required metric is unavailable—missing data never passes a filter silently.</p></div><ButtonLink href="/watchlist" variant="secondary">Watchlist</ButtonLink></div>
    {params.error ? <p className="mt-4 text-sm text-red-300">The screener action could not be completed.</p> : null}

    <div className="mt-8 grid gap-5 xl:grid-cols-[360px_1fr]">
      <div className="space-y-5">
        <Card><h2 className="font-semibold text-[#f4efe5]">Presets</h2><div className="mt-3 flex flex-wrap gap-2">{SCREENER_PRESETS.map((item) => <ButtonLink key={item.key} href={`/screener?preset=${encodeURIComponent(item.key)}`} variant={item.key === preset.key && !selectedSaved ? "primary" : "ghost"} className="h-8 px-2 text-xs">{item.name}</ButtonLink>)}</div></Card>
        <Card><h2 className="font-semibold text-[#f4efe5]">Save a screen</h2><form action={saveScreenerAction} className="mt-4 space-y-3">
          <input name="name" required maxLength={80} placeholder="Screen name" className="h-10 w-full rounded-md border border-white/12 bg-[#07111f] px-3" />
          <select name="preset" defaultValue={preset.key} className="h-10 w-full rounded-md border border-white/12 bg-[#07111f] px-3"> <option value="">Custom filters</option>{SCREENER_PRESETS.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}</select>
          <div className="grid grid-cols-2 gap-2">{[["country","Country (SE)"],["exchange","Exchange"],["minScore","Min score"],["maxPe","Max P/E"],["minFcfYieldPct","Min FCF yield %"],["minRevenueGrowthPct","Min revenue growth %"],["minRoicPct","Min ROIC %"],["maxNetDebtEbitda","Max net debt/EBITDA"],["maxHistoricalPePercentile","Max hist. P/E percentile"],["minFairValueUpsidePct","Min fair value upside %"]].map(([name,label]) => <input key={name} name={name} placeholder={label} className="h-9 rounded-md border border-white/12 bg-[#07111f] px-2 text-xs" />)}</div>
          <Button className="w-full">Save + run</Button>
        </form></Card>
        <Card><h2 className="font-semibold text-[#f4efe5]">Saved screeners</h2><div className="mt-3 space-y-2">{saved.length ? saved.map((item) => <div key={item.id} className="rounded-md border border-white/10 p-3"><ButtonLink href={`/screener?saved=${item.id}`} variant="ghost" className="h-8 px-1 text-sm">{item.name}</ButtonLink><p className="mt-1 text-xs text-[#748196]">Last run {item.lastRunAt ? new Date(item.lastRunAt).toLocaleString() : "never"}</p><div className="mt-2 flex gap-2"><form action={runSavedScreenerAction}><input type="hidden" name="id" value={item.id}/><Button variant="secondary" className="h-7 px-2 text-xs">Run</Button></form><form action={deleteSavedScreenerAction}><input type="hidden" name="id" value={item.id}/><Button variant="ghost" className="h-7 px-2 text-xs">Delete</Button></form></div></div>) : <p className="text-sm text-[#748196]">No saved screeners yet.</p>}</div></Card>
      </div>

      <div>
        <Card><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-[#f4efe5]">{selectedSaved?.name ?? preset.name}</h2><p className="mt-1 text-sm text-[#9aa7b8]">{results.length} companies currently match · catalog contains analyzed companies only.</p></div>{delta ? <div className="text-xs"><span className="text-emerald-300">+{(delta.entered_tickers ?? []).length} entered</span><span className="ml-3 text-red-300">-{(delta.left_tickers ?? []).length} left</span></div> : null}</div>
          <div className="mt-5 overflow-x-auto rounded-md border border-white/10"><table className="min-w-[1100px] w-full text-left text-xs"><thead><tr className="text-[#e1cb95]">{["Company","Country","Score","P/E","Hist P/E pct","FCF yield","Revenue growth","ROIC","Op. margin","Fair value upside","Updated"].map((h)=><th key={h} className="border-b border-white/10 px-3 py-2">{h}</th>)}</tr></thead><tbody>{results.slice(0,250).map((item)=><tr key={item.ticker} className="border-b border-white/5 text-[#c9d2df]"><td className="px-3 py-3"><p className="font-semibold text-[#e1cb95]">{item.ticker}</p><p>{item.companyName}</p></td><td className="px-3 py-3">{item.country ?? "—"}</td><td className="px-3 py-3">{num(item.snapshot.score,0)}</td><td className="px-3 py-3">{num(item.snapshot.valuation.pe)}×</td><td className="px-3 py-3">{item.snapshot.valuation.historicalPePercentile === null ? "—" : `${Math.round(item.snapshot.valuation.historicalPePercentile*100)}th`}</td><td className="px-3 py-3">{pct(item.snapshot.valuation.fcfYield)}</td><td className="px-3 py-3">{pct(item.snapshot.fundamentals.revenueGrowth)}</td><td className="px-3 py-3">{pct(item.snapshot.fundamentals.roic)}</td><td className="px-3 py-3">{pct(item.snapshot.fundamentals.operatingMargin)}</td><td className="px-3 py-3">{pct(item.snapshot.fairValueUpside)}</td><td className="px-3 py-3">{new Date(item.snapshot.capturedAt).toLocaleDateString()}</td></tr>)}</tbody></table></div>
        </Card>
      </div>
    </div>
  </Container></Section>;
}
