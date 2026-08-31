import type { Metadata } from "next";
import { Card, Container, Section } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Weekly Investor Brief" };
export const dynamic = "force-dynamic";

type BriefContent = {
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  mostImportantChanges: Array<{ ticker: string; materiality: string; reasoning: string }>;
  watchlistOpportunities: Array<{ ticker: string; companyName: string; fairValueUpside: number | null; historicalPePercentile: number | null; score: number | null }>;
  portfolioRisks: Array<{ ticker: string; materiality: string; reasoning: string }>;
  thesisAlerts: Array<{ ticker: string; title: string; status: string; newlyFailed: string[] }>;
  earningsAhead: Array<{ ticker: string; date: string; label?: string }>;
  estimateRevisions: Array<{ ticker: string; metric: string; direction: string; change: number | null }>;
  dividendEvents: Array<{ ticker: string; kind: string; value?: number | null }>;
  newScreenerMatches: Array<{ ticker: string; screenerName: string }>;
  companiesWorthReviewing: string[];
};

function pct(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%` : "—";
}

export default async function BriefsPage() {
  const user = await getCurrentUser();
  if (!user) return <Section><Container className="max-w-4xl"><Card><h1 className="serif text-3xl font-semibold">Weekly Investor Brief</h1><p className="mt-3 text-sm text-[#9aa7b8]">Sign in to view your persisted StockBox intelligence briefs.</p><ButtonLink href="/auth/login" className="mt-5">Sign in</ButtonLink></Card></Container></Section>;

  const supabase = await createClient();
  const { data: rows } = supabase ? await supabase.from("weekly_briefs").select("id,period_start,period_end,content,created_at").order("period_end", { ascending: false }).limit(12) : { data: [] };
  const briefs = (rows ?? []).map((row) => ({ ...row, content: row.content as BriefContent }));

  return <Section><Container className="max-w-6xl">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-[#e1cb95]">RETENTION INTELLIGENCE</p><h1 className="serif mt-2 text-3xl font-semibold text-[#f4efe5]">Your StockBox Weekly Brief</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-[#9aa7b8]">A persisted summary built only from your StockBox snapshots, material changes, thesis evaluations, alerts, portfolio and watchlist data. Unsupported sections stay empty.</p></div><ButtonLink href="/dashboard" variant="secondary">Command Center</ButtonLink></div>
    <div className="mt-8 space-y-6">
      {briefs.length ? briefs.map((row) => { const brief = row.content; return <Card key={row.id}>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold text-[#e1cb95]">{brief.periodStart} → {brief.periodEnd}</p><h2 className="mt-1 text-xl font-semibold text-[#f4efe5]">Investor intelligence summary</h2></div><span className="text-xs text-[#748196]">Generated {new Date(brief.generatedAt).toLocaleString()}</span></div>
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <div><h3 className="font-semibold text-[#f4efe5]">Most Important Changes</h3><div className="mt-2 space-y-2">{brief.mostImportantChanges.length ? brief.mostImportantChanges.map((item, index) => <div key={`${item.ticker}-${index}`} className="rounded-md border border-white/10 bg-[#07111f]/60 p-3"><p className="font-semibold text-[#e1cb95]">{item.ticker} · {item.materiality}</p><p className="mt-1 text-sm text-[#c9d2df]">{item.reasoning}</p></div>) : <p className="text-sm text-[#748196]">No important changes recorded.</p>}</div></div>
          <div><h3 className="font-semibold text-[#f4efe5]">Watchlist Opportunities</h3><div className="mt-2 space-y-2">{brief.watchlistOpportunities.length ? brief.watchlistOpportunities.map((item) => <div key={item.ticker} className="rounded-md border border-white/10 bg-[#07111f]/60 p-3"><p className="font-semibold text-[#e1cb95]">{item.ticker} · {item.companyName}</p><p className="mt-1 text-sm text-[#c9d2df]">Fair-value upside {pct(item.fairValueUpside)} · P/E percentile {item.historicalPePercentile === null ? "—" : `${Math.round(item.historicalPePercentile * 100)}th`} · Score {item.score === null ? "—" : Math.round(item.score)}</p></div>) : <p className="text-sm text-[#748196]">No valuation opportunities met the current deterministic criteria.</p>}</div></div>
          <div><h3 className="font-semibold text-[#f4efe5]">Portfolio Risks</h3><div className="mt-2 space-y-2">{brief.portfolioRisks.length ? brief.portfolioRisks.map((item, index) => <div key={`${item.ticker}-${index}`} className="rounded-md border border-white/10 bg-[#07111f]/60 p-3"><p className="font-semibold text-amber-300">{item.ticker} · {item.materiality}</p><p className="mt-1 text-sm text-[#c9d2df]">{item.reasoning}</p></div>) : <p className="text-sm text-[#748196]">No material portfolio risks recorded this period.</p>}</div></div>
          <div><h3 className="font-semibold text-[#f4efe5]">Thesis Alerts</h3><div className="mt-2 space-y-2">{brief.thesisAlerts.length ? brief.thesisAlerts.map((item) => <div key={item.ticker} className="rounded-md border border-white/10 bg-[#07111f]/60 p-3"><p className="font-semibold text-amber-300">{item.ticker} · {item.status}</p><p className="mt-1 text-sm text-[#c9d2df]">{item.title}{item.newlyFailed.length ? ` · Newly failed: ${item.newlyFailed.join(", ")}` : ""}</p></div>) : <p className="text-sm text-[#748196]">No thesis conditions require attention.</p>}</div></div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-4">{[["Earnings ahead", brief.earningsAhead.length],["Estimate revisions", brief.estimateRevisions.length],["Dividend events", brief.dividendEvents.length],["New screener matches", brief.newScreenerMatches.length]].map(([label, count]) => <div key={String(label)} className="rounded-md border border-white/10 p-3"><p className="text-xs text-[#9aa7b8]">{label}</p><p className="number mt-1 text-xl font-semibold text-[#f4efe5]">{count}</p></div>)}</div>
        {brief.companiesWorthReviewing.length ? <p className="mt-5 text-sm text-[#9aa7b8]">Worth reviewing: <span className="text-[#f4efe5]">{brief.companiesWorthReviewing.join(", ")}</span></p> : null}
      </Card>; }) : <Card><p className="text-sm text-[#9aa7b8]">No weekly brief has been generated yet. Briefs are generated from persisted investor-intelligence data.</p></Card>}
    </div>
  </Container></Section>;
}
