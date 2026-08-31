import Link from "next/link";
import type { Metadata, Route } from "next";
import { AlertTriangle, ArrowRight, BellRing, BriefcaseBusiness, CalendarClock, Search, Target, TrendingUp } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card, Container, Section } from "@/components/ui/card";
import { DashboardVisitMarker } from "@/components/investor/dashboard-visit-marker";
import { getCurrentUser } from "@/lib/auth/session";
import { localizedResearchView, overallResearchView } from "@/lib/analysis/research-view";
import { getUserSubscription, subscriptionBillingState } from "@/lib/billing/subscriptions";
import { getUserAnalysisHistory } from "@/lib/db/repositories";
import { getP0Copy } from "@/lib/i18n/p0-copy";
import { getLocale } from "@/lib/i18n/server";
import { getDashboardExtensions } from "@/lib/investor-intelligence/dashboard-extensions";
import { getDashboardIntelligence, getWatchlistIntelligence } from "@/lib/investor-intelligence/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };
function pct(value:number|null|undefined){return typeof value==="number"&&Number.isFinite(value)?`${value>=0?"+":""}${(value*100).toFixed(1)}%`:"—";}

export default async function DashboardPage(){
  const [user,locale]=await Promise.all([getCurrentUser(),getLocale()]);
  const copy=getP0Copy(locale).dashboard;
  const supabase=user?await createClient():null;
  const [historyResult,subscriptionLookup,intelligence,watchlist,portfolioResult,extensions]=await Promise.all([
    user?getUserAnalysisHistory({userId:user.id,page:1,pageSize:8}):Promise.resolve({ok:true as const,data:[],count:0}),
    user?getUserSubscription(user.id):Promise.resolve(null),
    user?getDashboardIntelligence(user.id):Promise.resolve({lastVisit:null,changes:[],theses:[],alerts:[],snapshots:[]}),
    user?getWatchlistIntelligence():Promise.resolve([]),
    supabase?supabase.from("portfolios").select("id,name,holdings(id)").order("updated_at",{ascending:false}).limit(8):Promise.resolve({data:[]}),
    user?getDashboardExtensions(user.id):Promise.resolve({upcomingEarnings:[],screenerMatches:[]}),
  ]);
  const analyses=historyResult.ok?historyResult.data:[];
  const savedAnalysisCount=historyResult.ok?historyResult.count:0;
  const billingState=subscriptionLookup?.ok?subscriptionBillingState(subscriptionLookup.subscription):null;
  const planLabel=user?.role==="affiliate_ambassador"?"Affiliate Ambassador":billingState==="basic"?"Basic":billingState==="basic_manage"?"Basic · billing action required":billingState==="free"?"Free":"Unavailable";
  const opportunities=watchlist.filter((row)=>row.snapshot&&((row.snapshot.fairValueUpside??-1)>=.15||(row.snapshot.valuation.historicalPePercentile??1)<=.25||(row.snapshot.score??0)>=85)).slice(0,6);
  const portfolios=portfolioResult.data??[];
  const holdingCount=portfolios.reduce((sum,portfolio)=>sum+(Array.isArray(portfolio.holdings)?portfolio.holdings.length:0),0);

  return <Section><Container>
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-[#e1cb95]">INVESTOR COMMAND CENTER</p><h1 className="serif mt-2 text-3xl font-semibold text-[#f4efe5]">What should I know today?</h1><p className="mt-3 max-w-3xl text-sm text-[#9aa7b8]">Material changes, thesis warnings, valuation opportunities, earnings and new screener matches first. Billing remains available without dominating the research workflow.</p></div><div className="flex flex-wrap gap-2"><ButtonLink href="/copilot" variant="secondary">Copilot</ButtonLink><ButtonLink href="/briefs" variant="secondary">Weekly Brief</ButtonLink><ButtonLink href="/analyze"><Search className="h-4 w-4"/>{copy.newAnalysis}</ButtonLink></div></div>
    {!user?<Card className="mt-8"><h2 className="text-lg font-semibold text-[#f4efe5]">{copy.signInTitle}</h2><p className="mt-2 text-sm text-[#9aa7b8]">{copy.signInCopy}</p><ButtonLink href="/auth/login" className="mt-5">{copy.login}<ArrowRight className="h-4 w-4"/></ButtonLink></Card>:<>
      <DashboardVisitMarker/>
      <div className="mt-8 grid gap-4 lg:grid-cols-4">
        <Card><AlertTriangle className="h-5 w-5 text-amber-300"/><p className="mt-3 text-xs text-[#9aa7b8]">Since your last visit</p><p className="number mt-1 text-3xl font-semibold">{intelligence.changes.length}</p><p className="mt-1 text-xs text-[#748196]">important / thesis-changing events</p></Card>
        <Card><Target className="h-5 w-5 text-[#e1cb95]"/><p className="mt-3 text-xs text-[#9aa7b8]">Thesis attention</p><p className="number mt-1 text-3xl font-semibold">{intelligence.theses.length}</p><Link href="/thesis" className="mt-3 inline-flex text-xs font-semibold text-[#e1cb95]">Review theses</Link></Card>
        <Card><BellRing className="h-5 w-5 text-[#e1cb95]"/><p className="mt-3 text-xs text-[#9aa7b8]">Unacknowledged alerts</p><p className="number mt-1 text-3xl font-semibold">{intelligence.alerts.length}</p><Link href="/alerts" className="mt-3 inline-flex text-xs font-semibold text-[#e1cb95]">Open alerts</Link></Card>
        <Card><BriefcaseBusiness className="h-5 w-5 text-[#e1cb95]"/><p className="mt-3 text-xs text-[#9aa7b8]">Portfolio</p><p className="number mt-1 text-3xl font-semibold">{holdingCount}</p><div className="mt-3 flex gap-3"><Link href="/portfolio" className="text-xs font-semibold text-[#e1cb95]">Manage</Link><Link href="/portfolio/intelligence" className="text-xs font-semibold text-[#e1cb95]">Intelligence</Link></div></Card>
      </div>

      <section className="mt-10"><h2 className="text-lg font-semibold text-[#f4efe5]">Since your last visit</h2><p className="mt-1 text-xs text-[#9aa7b8]">{intelligence.lastVisit?`Changes after ${new Date(intelligence.lastVisit).toLocaleString()}`:"First visit baseline: future material changes will appear here."}</p><div className="mt-4 grid gap-3 lg:grid-cols-2">{intelligence.changes.length?intelligence.changes.slice(0,8).map((change)=><Card key={change.id}><div className="flex items-start justify-between gap-4"><div><p className="font-semibold text-[#e1cb95]">{change.ticker}</p><p className="mt-2 text-sm leading-6 text-[#f4efe5]">{change.reasoning}</p><p className="mt-2 text-xs text-[#9aa7b8]">{change.metricKey} · {new Date(change.createdAt).toLocaleString()}</p></div><span className={`text-xs font-bold ${change.materiality==="THESIS_CHANGING"?"text-red-300":"text-amber-300"}`}>{change.materiality}</span></div></Card>):<Card className="lg:col-span-2"><p className="text-sm text-[#9aa7b8]">No important changes have been recorded since the previous dashboard visit.</p></Card>}</div></section>

      <div className="mt-10 grid gap-8 xl:grid-cols-2">
        <section><div className="flex items-center justify-between"><h2 className="text-lg font-semibold text-[#f4efe5]">Watchlist opportunities</h2><Link href="/watchlist?sort=upside" className="text-xs font-semibold text-[#e1cb95]">Full watchlist</Link></div><div className="mt-4 overflow-hidden rounded-xl border border-white/10">{opportunities.length?opportunities.map((row)=><Link key={row.watchlistId} href={(row.snapshot?`/analysis/${row.snapshot.analysisId}`:"/analyze") as Route} className="grid grid-cols-[80px_1fr_auto] gap-3 border-b border-white/10 bg-[#0d1c2e]/70 p-4 last:border-0 hover:bg-white/8"><span className="font-semibold text-[#e1cb95]">{row.ticker}</span><div><p className="text-sm text-[#f4efe5]">{row.companyName}</p><p className="mt-1 text-xs text-[#9aa7b8]">Score {row.snapshot?.score?.toFixed(0)??"—"} · P/E percentile {row.snapshot?.valuation.historicalPePercentile==null?"—":`${Math.round(row.snapshot.valuation.historicalPePercentile*100)}th`}</p></div><span className="text-sm font-semibold text-emerald-300">{pct(row.snapshot?.fairValueUpside)}</span></Link>):<p className="bg-[#0d1c2e]/70 p-5 text-sm text-[#9aa7b8]">No company currently meets the displayed opportunity rules.</p>}</div></section>
        <section><div className="flex items-center justify-between"><h2 className="text-lg font-semibold text-[#f4efe5]">Thesis alerts</h2><Link href="/thesis" className="text-xs font-semibold text-[#e1cb95]">All theses</Link></div><div className="mt-4 overflow-hidden rounded-xl border border-white/10">{intelligence.theses.length?intelligence.theses.map((thesis)=><Link key={thesis.id} href={`/thesis/${encodeURIComponent(thesis.ticker)}` as Route} className="flex items-center justify-between gap-4 border-b border-white/10 bg-[#0d1c2e]/70 p-4 last:border-0 hover:bg-white/8"><div><p className="font-semibold text-[#e1cb95]">{thesis.ticker}</p><p className="mt-1 text-sm text-[#f4efe5]">{thesis.title}</p></div><span className={`text-xs font-bold ${thesis.status==="BROKEN"?"text-red-300":"text-amber-300"}`}>{thesis.status}</span></Link>):<p className="bg-[#0d1c2e]/70 p-5 text-sm text-[#9aa7b8]">No active thesis currently requires attention.</p>}</div></section>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Card><div className="flex items-start justify-between gap-3"><div><CalendarClock className="h-5 w-5 text-[#e1cb95]"/><h2 className="mt-3 font-semibold text-[#f4efe5]">Upcoming earnings</h2></div><span className="number text-xl font-semibold">{extensions.upcomingEarnings.length}</span></div><div className="mt-3 space-y-2">{extensions.upcomingEarnings.length?extensions.upcomingEarnings.slice(0,8).map((item)=><div key={`${item.ticker}-${item.eventDate}`} className="flex items-center justify-between gap-3 text-sm"><span className="font-semibold text-[#e1cb95]">{item.ticker}</span><span className="text-[#c9d2df]">{new Date(item.eventDate).toLocaleDateString()} · {item.fiscalQuarter??"quarter"} {item.fiscalYear??""}</span></div>):<p className="text-sm leading-6 text-[#9aa7b8]">No source-backed upcoming earnings dates are currently stored for your watchlist or portfolio.</p>}</div></Card>
        <Card><div className="flex items-start justify-between gap-3"><div><TrendingUp className="h-5 w-5 text-[#e1cb95]"/><h2 className="mt-3 font-semibold text-[#f4efe5]">New screener matches</h2></div><ButtonLink href="/screener" variant="ghost" className="h-8 px-2 text-xs">Open screener</ButtonLink></div><div className="mt-3 space-y-2">{extensions.screenerMatches.length?extensions.screenerMatches.slice(0,6).map((item)=><div key={item.screenerId} className="rounded-md border border-white/10 p-3"><p className="text-sm font-semibold text-[#f4efe5]">{item.screenerName}</p><p className="mt-1 text-xs text-emerald-300">New: {item.enteredTickers.slice(0,8).join(", ")}{item.enteredTickers.length>8?` +${item.enteredTickers.length-8}`:""}</p></div>):<p className="text-sm leading-6 text-[#9aa7b8]">No saved screener has new entrants in its latest snapshot.</p>}</div></Card>
      </div>

      <section className="mt-10"><h2 className="text-lg font-semibold text-[#f4efe5]">{copy.recentResearch}</h2><div className="mt-4 overflow-hidden rounded-lg border border-white/10">{analyses.length?analyses.map((analysis)=><Link key={analysis.id} href={`/analysis/${analysis.id}` as Route} className="grid gap-2 border-b border-white/10 bg-[#0d1c2e]/70 px-4 py-4 last:border-0 hover:bg-white/8 sm:grid-cols-[90px_1fr_120px_80px] sm:items-center"><span className="font-semibold text-[#e1cb95]">{analysis.ticker}</span><span className="text-sm text-[#f4efe5]">{analysis.company_name}</span><span className="text-sm text-[#c9d2df]">{localizedResearchView(overallResearchView({score:analysis.score,confidence:analysis.confidence,coverage:analysis.data_coverage}),locale)}</span><span className="number text-sm text-[#9aa7b8]">{analysis.score===null?"—":`${Math.round(analysis.score)}/100`}</span></Link>):<p className="bg-[#0d1c2e]/70 p-5 text-sm text-[#9aa7b8]">{copy.empty}</p>}</div></section>
      <div className="mt-8 grid gap-4 sm:grid-cols-2"><Card><p className="text-xs text-[#9aa7b8]">Saved analyses</p><p className="number mt-1 text-2xl font-semibold">{savedAnalysisCount}</p><Link href="/history" className="mt-3 inline-flex text-xs font-semibold text-[#e1cb95]">View history</Link></Card><Card><p className="text-xs text-[#9aa7b8]">Plan & billing</p><p className="mt-1 text-xl font-semibold">{planLabel}</p><Link href={billingState==="basic"||billingState==="basic_manage"?"/settings/billing":"/pricing"} className="mt-3 inline-flex text-xs font-semibold text-[#e1cb95]">{billingState==="basic_manage"?copy.resolveBilling:billingState==="basic"?copy.managePlan:copy.viewPlans}</Link></Card></div>
    </>}
  </Container></Section>;
}
