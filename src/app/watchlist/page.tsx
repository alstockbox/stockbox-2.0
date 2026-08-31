import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle, Bell, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, Container, Section } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { getP0Copy } from "@/lib/i18n/p0-copy";
import { getLocale } from "@/lib/i18n/server";
import { getWatchlistIntelligence, type WatchlistIntelligenceRow } from "@/lib/investor-intelligence/queries";
import { addWatchlistItemAction, removeWatchlistItemAction } from "@/lib/workspace/actions";

export const metadata: Metadata = { title: "Watchlist" };
type PageProps = { searchParams: Promise<{ limit?: string; error?: string; sort?: string; filter?: string }> };

function pct(value: number | null | undefined, digits = 1) {
  return typeof value === "number" && Number.isFinite(value) ? `${value >= 0 ? "+" : ""}${(value * 100).toFixed(digits)}%` : "—";
}
function num(value: number | null | undefined, digits = 1) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "—";
}
function scoreDelta(row: WatchlistIntelligenceRow) {
  const current = row.snapshot?.score;
  const previous = row.previousSnapshot?.score;
  return typeof current === "number" && typeof previous === "number" ? current - previous : null;
}
function sortRows(rows: WatchlistIntelligenceRow[], sort: string | undefined) {
  const value = (row: WatchlistIntelligenceRow, key: string) => {
    if (key === "score") return row.snapshot?.score ?? Number.NEGATIVE_INFINITY;
    if (key === "scoreChange") return scoreDelta(row) ?? Number.NEGATIVE_INFINITY;
    if (key === "upside") return row.snapshot?.fairValueUpside ?? Number.NEGATIVE_INFINITY;
    if (key === "historical") return row.snapshot?.valuation.historicalPePercentile ?? Number.POSITIVE_INFINITY;
    if (key === "fcf") return row.snapshot?.valuation.fcfYield ?? Number.NEGATIVE_INFINITY;
    if (key === "dividend") return row.snapshot?.dividend.yield ?? Number.NEGATIVE_INFINITY;
    if (key === "updated") return row.snapshot ? Date.parse(row.snapshot.capturedAt) : 0;
    return 0;
  };
  const copy = [...rows];
  switch (sort) {
    case "score_asc": return copy.sort((a, b) => value(a, "score") - value(b, "score"));
    case "score_change": return copy.sort((a, b) => value(b, "scoreChange") - value(a, "scoreChange"));
    case "upside": return copy.sort((a, b) => value(b, "upside") - value(a, "upside"));
    case "downside": return copy.sort((a, b) => value(a, "upside") - value(b, "upside"));
    case "historically_cheapest": return copy.sort((a, b) => value(a, "historical") - value(b, "historical"));
    case "historically_expensive": return copy.sort((a, b) => value(b, "historical") - value(a, "historical"));
    case "fcf_yield": return copy.sort((a, b) => value(b, "fcf") - value(a, "fcf"));
    case "dividend_yield": return copy.sort((a, b) => value(b, "dividend") - value(a, "dividend"));
    case "recent": return copy.sort((a, b) => value(b, "updated") - value(a, "updated"));
    default: return copy.sort((a, b) => value(b, "score") - value(a, "score"));
  }
}
function filterRows(rows: WatchlistIntelligenceRow[], filter: string | undefined) {
  if (filter === "thesis_warning") return rows.filter((row) => ["WATCH", "WEAKENING", "BROKEN"].includes(row.thesis?.status ?? ""));
  if (filter === "active_alert") return rows.filter((row) => row.activeAlertCount > 0);
  if (filter === "recently_changed") return rows.filter((row) => Boolean(row.latestChange));
  return rows;
}

export default async function WatchlistPage({ searchParams }: PageProps) {
  const [params, user, locale] = await Promise.all([searchParams, getCurrentUser(), getLocale()]);
  const copy = getP0Copy(locale).watchlist;
  const intelligence = user ? await getWatchlistIntelligence() : [];
  const rows = sortRows(filterRows(intelligence, params.filter), params.sort);
  const feedback = params.limit ? copy.limit : params.error ? copy.error : null;

  return <Section><Container className="max-w-[1500px]">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-[#e1cb95]">SMART WATCHLIST V2</p><h1 className="serif mt-2 text-3xl font-semibold text-[#f4efe5]">Monitor what matters, not just tickers</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-[#9aa7b8]">Latest StockBox state, valuation context, thesis status and material changes in one workspace. Missing metrics remain missing rather than being substituted.</p></div><div className="flex gap-2"><ButtonLink href="/alerts" variant="secondary">Alerts</ButtonLink><ButtonLink href="/thesis" variant="secondary">Theses</ButtonLink></div></div>
    {feedback ? <p className="mt-5 text-sm text-[#e1cb95]" role="status">{feedback}</p> : null}
    {!user ? <Card className="mt-8"><p className="text-sm text-[#c9d2df]">{copy.loginCopy}</p><ButtonLink href="/auth/login" className="mt-4">{copy.login}</ButtonLink></Card> : <>
      <Card className="mt-8"><form action={addWatchlistItemAction} className="grid gap-3 sm:grid-cols-[160px_1fr_auto]"><label className="sr-only" htmlFor="watch-ticker">{copy.ticker}</label><input id="watch-ticker" name="ticker" placeholder={copy.ticker} required maxLength={16} className="h-10 rounded-md border border-white/12 bg-[#07111f] px-3" /><label className="sr-only" htmlFor="watch-name">{copy.company}</label><input id="watch-name" name="companyName" placeholder={copy.company} required maxLength={160} className="h-10 rounded-md border border-white/12 bg-[#07111f] px-3" /><Button><Plus className="h-4 w-4" />{copy.add}</Button></form></Card>

      <div className="mt-5 flex flex-wrap gap-2 text-xs">
        <Link href="/watchlist" className="rounded-md border border-white/10 px-3 py-2 text-[#c9d2df] hover:bg-white/8">All</Link>
        <Link href="/watchlist?filter=recently_changed" className="rounded-md border border-white/10 px-3 py-2 text-[#c9d2df] hover:bg-white/8">Recently changed</Link>
        <Link href="/watchlist?filter=thesis_warning" className="rounded-md border border-white/10 px-3 py-2 text-[#c9d2df] hover:bg-white/8">Thesis warnings</Link>
        <Link href="/watchlist?filter=active_alert" className="rounded-md border border-white/10 px-3 py-2 text-[#c9d2df] hover:bg-white/8">Active alerts</Link>
        <span className="mx-1 border-l border-white/10" />
        {[['score_desc','Highest score'],['score_asc','Lowest score'],['score_change','Score improvement'],['upside','Fair-value upside'],['downside','Downside'],['historically_cheapest','Historical low percentile'],['historically_expensive','Historical high percentile'],['fcf_yield','FCF yield'],['dividend_yield','Dividend yield'],['recent','Recently updated']].map(([value,label]) => <Link key={value} href={`/watchlist?sort=${value}`} className="rounded-md border border-white/10 px-3 py-2 text-[#9aa7b8] hover:bg-white/8">{label}</Link>)}
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-white/10"><table className="min-w-[1320px] w-full border-collapse text-left text-xs"><thead className="bg-[#07111f]"><tr className="text-[#9aa7b8]"><th className="px-4 py-3">Company</th><th className="px-3 py-3">Price / 1D</th><th className="px-3 py-3">Score</th><th className="px-3 py-3">Fair value</th><th className="px-3 py-3">P/E history</th><th className="px-3 py-3">Cash / dividend</th><th className="px-3 py-3">Thesis</th><th className="px-3 py-3">What changed?</th><th className="px-3 py-3">Updated</th><th className="px-3 py-3">Actions</th></tr></thead><tbody>
        {rows.length ? rows.map((row) => {
          const s = row.snapshot;
          const delta = scoreDelta(row);
          const analysisHref = s ? `/analysis/${s.analysisId}` : "/analyze";
          return <tr key={row.watchlistId} className="border-t border-white/10 bg-[#0d1c2e]/70 align-top text-[#d6deea]">
            <td className="px-4 py-4"><p className="font-semibold text-[#e1cb95]">{row.ticker}</p><p className="mt-1 max-w-[180px] text-[#f4efe5]">{row.companyName}</p><p className="mt-2 text-[11px] text-[#748196]">Exchange: —</p></td>
            <td className="px-3 py-4"><p className="number font-semibold text-[#f4efe5]">{num(s?.price, 2)}</p><p className={`mt-1 ${typeof s?.priceChange1d === "number" && s.priceChange1d < 0 ? "text-red-300" : "text-emerald-300"}`}>{pct(s?.priceChange1d)}</p></td>
            <td className="px-3 py-4"><p className="number text-lg font-semibold text-[#f4efe5]">{num(s?.score, 0)}</p><p className="mt-1 text-[#9aa7b8]">Prev {num(row.previousSnapshot?.score, 0)} · Δ {delta === null ? "—" : `${delta >= 0 ? "+" : ""}${delta.toFixed(0)}`}</p><p className="mt-1 text-[#748196]">Conf. {s?.confidence === null || s?.confidence === undefined ? "—" : `${(s.confidence * 100).toFixed(0)}%`}</p></td>
            <td className="px-3 py-4"><p className="number font-semibold text-[#f4efe5]">{num(s?.fairValue, 2)}</p><p className={`mt-1 ${typeof s?.fairValueUpside === "number" && s.fairValueUpside < 0 ? "text-red-300" : "text-emerald-300"}`}>{pct(s?.fairValueUpside)}</p></td>
            <td className="px-3 py-4"><p>P/E <span className="number text-[#f4efe5]">{num(s?.valuation.pe, 1)}×</span></p><p className="mt-1">vs 5Y {pct(s?.valuation.peVs5yMedian)}</p><p className="mt-1">vs 10Y {pct(s?.valuation.peVs10yMedian)}</p><p className="mt-1">Percentile {s?.valuation.historicalPePercentile === null || s?.valuation.historicalPePercentile === undefined ? "—" : `${Math.round(s.valuation.historicalPePercentile * 100)}th`}</p></td>
            <td className="px-3 py-4"><p>FCF yield <span className="text-[#f4efe5]">{pct(s?.valuation.fcfYield)}</span></p><p className="mt-1">Dividend <span className="text-[#f4efe5]">{pct(s?.dividend.yield)}</span></p><p className="mt-2 text-[11px] text-[#748196]">Earnings date: unavailable</p></td>
            <td className="px-3 py-4">{row.thesis ? <><Link href={`/thesis/${encodeURIComponent(row.ticker)}`} className={`font-bold ${["WATCH","WEAKENING","BROKEN"].includes(row.thesis.status) ? "text-amber-300" : "text-emerald-300"}`}>{row.thesis.status}</Link><p className="mt-1 max-w-[160px] text-[#9aa7b8]">{row.thesis.title}</p></> : <ButtonLink href="/thesis" variant="ghost" className="h-8 px-2 text-xs">Create thesis</ButtonLink>}</td>
            <td className="px-3 py-4">{row.latestChange ? <div className="max-w-[260px]"><p className={`font-bold ${row.latestChange.materiality === "THESIS_CHANGING" ? "text-red-300" : "text-amber-300"}`}><AlertTriangle className="mr-1 inline h-3.5 w-3.5" />{row.latestChange.materiality}</p><p className="mt-1 leading-5 text-[#c9d2df]">{row.latestChange.reasoning}</p></div> : <span className="text-[#748196]">No important change recorded</span>}</td>
            <td className="px-3 py-4"><p>{s ? new Date(s.capturedAt).toLocaleDateString() : "Never analyzed"}</p><p className="mt-1 text-[#748196]">{row.activeAlertCount} active alert{row.activeAlertCount === 1 ? "" : "s"}</p></td>
            <td className="px-3 py-4"><div className="flex max-w-[170px] flex-wrap gap-1"><ButtonLink href={analysisHref} variant="ghost" className="h-8 px-2 text-xs">Analysis</ButtonLink><ButtonLink href={`/alerts?ticker=${encodeURIComponent(row.ticker)}`} variant="ghost" className="h-8 px-2 text-xs"><Bell className="h-3 w-3" />Alert</ButtonLink>{s ? <ButtonLink href={`/compare?id=${encodeURIComponent(s.analysisId)}`} variant="ghost" className="h-8 px-2 text-xs">Compare</ButtonLink> : null}{s ? <ButtonLink href={`${analysisHref}#historical`} variant="ghost" className="h-8 px-2 text-xs">History</ButtonLink> : null}<form action={removeWatchlistItemAction}><input type="hidden" name="id" value={row.watchlistId} /><Button variant="ghost" className="h-8 w-8 px-0" title={copy.remove}><Trash2 className="h-3.5 w-3.5" /></Button></form></div></td>
          </tr>;
        }) : <tr><td colSpan={10} className="bg-[#0d1c2e]/70 p-6 text-sm text-[#9aa7b8]"><Bell className="mr-2 inline h-5 w-5" />{intelligence.length ? "No companies match the current filter." : copy.empty}</td></tr>}
      </tbody></table></div>
      <Card className="mt-5"><p className="flex items-center gap-2 text-xs text-[#9aa7b8]"><RefreshCw className="h-4 w-4 text-[#e1cb95]" />Snapshots update after valid StockBox analyses today. Structured upcoming-earnings data is intentionally shown as unavailable until the earnings provider layer is implemented.</p></Card>
    </>}
  </Container></Section>;
}
