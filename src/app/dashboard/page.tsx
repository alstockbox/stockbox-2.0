import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, BarChart3, BookOpen, CircleDollarSign, Clock3, Newspaper, Search } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card, Container, Section } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { localizedResearchView, overallResearchView } from "@/lib/analysis/research-view";
import { getUserSubscription, subscriptionBillingState } from "@/lib/billing/subscriptions";
import { getUserAnalysisHistory } from "@/lib/db/repositories";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getP0Copy } from "@/lib/i18n/p0-copy";
import { getLocale } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);
  const copy = getP0Copy(locale).dashboard;
  const dailyBriefingEnabled = isFeatureEnabled("dailyBriefing");
  const academyEnabled = isFeatureEnabled("academy");
  const investorScoreEnabled = isFeatureEnabled("investorScore");
  const paperTradingEnabled = isFeatureEnabled("paperTrading");
  const [historyResult, subscriptionLookup] = await Promise.all([
    user
      ? getUserAnalysisHistory({ userId: user.id, page: 1, pageSize: 8 })
      : Promise.resolve({ ok: true as const, data: [], count: 0 }),
    user ? getUserSubscription(user.id) : Promise.resolve(null)
  ]);
  const analyses = historyResult.ok ? historyResult.data : [];
  const savedAnalysisCount = historyResult.ok ? historyResult.count : 0;
  const billingState = subscriptionLookup?.ok
    ? subscriptionBillingState(subscriptionLookup.subscription)
    : null;
  const planLabel = user?.role === "affiliate_ambassador"
    ? "Affiliate Ambassador"
    : billingState === "basic"
      ? "Basic"
      : billingState === "basic_manage"
        ? "Basic · billing action required"
        : billingState === "free"
          ? "Free"
          : "Unavailable";

  return (
    <Section>
      <Container>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-sm font-semibold text-[#e1cb95]">{copy.kicker}</p><h1 className="serif mt-2 text-3xl font-semibold text-[#f4efe5]">{copy.title}</h1></div>
          <ButtonLink href="/analyze"><Search className="h-4 w-4" aria-hidden="true" />{copy.newAnalysis}</ButtonLink>
        </div>
        {!user ? (
          <Card className="mt-8"><h2 className="text-lg font-semibold text-[#f4efe5]">{copy.signInTitle}</h2><p className="mt-2 text-sm leading-6 text-[#9aa7b8]">{copy.signInCopy}</p><ButtonLink href="/auth/login" className="mt-5">{copy.login} <ArrowRight className="h-4 w-4" aria-hidden="true" /></ButtonLink></Card>
        ) : (
          <>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <Card><BarChart3 className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" /><p className="mt-3 text-xs text-[#9aa7b8]">{copy.savedAnalyses}</p><p className="number mt-1 text-3xl font-semibold">{savedAnalysisCount}</p><Link href="/history" className="mt-3 inline-flex text-xs font-semibold text-[#e1cb95] hover:text-white">{locale === "sv" ? "Visa alla" : "View all"}</Link></Card>
              <Card><Clock3 className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" /><p className="mt-3 text-xs text-[#9aa7b8]">{copy.currentAccess}</p><p className="mt-1 text-xl font-semibold">{planLabel}</p><Link href={billingState === "basic" || billingState === "basic_manage" ? "/settings/billing" : "/pricing"} className="mt-3 inline-flex text-xs font-semibold text-[#e1cb95] hover:text-white">{billingState === "basic_manage" ? copy.resolveBilling : billingState === "basic" ? copy.managePlan : copy.viewPlans}</Link></Card>
              <Card><Search className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" /><p className="mt-3 text-xs text-[#9aa7b8]">{copy.defaultWorkflow}</p><p className="mt-1 text-xl font-semibold">{copy.workflow}</p></Card>
            </div>
            {dailyBriefingEnabled ? (
              <Card className="mt-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <Newspaper className="mt-0.5 h-5 w-5 shrink-0 text-[#e1cb95]" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-semibold text-[#f4efe5]">Daily Briefing</p>
                      <p className="mt-1 text-sm leading-6 text-[#9aa7b8]">{locale === "sv" ? "Se verifierade StockBox-förändringar, officiell bevakning och sparade portföljfakta från de senaste 24 timmarna." : "See verified StockBox changes, official monitoring and saved portfolio facts from the last 24 hours."}</p>
                    </div>
                  </div>
                  <ButtonLink href="/briefing">{locale === "sv" ? "Öppna briefing" : "Open briefing"} <ArrowRight className="h-4 w-4" aria-hidden="true" /></ButtonLink>
                </div>
              </Card>
            ) : null}
            {academyEnabled ? (
              <Card className="mt-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-[#e1cb95]" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-semibold text-[#f4efe5]">StockBox Academy</p>
                      <p className="mt-1 text-sm leading-6 text-[#9aa7b8]">{locale === "sv" ? "Träna bolagsanalys med korta lektioner och quiz. Din utbildningsprogress påverkar aldrig StockBox objektiva rating eller User Match." : "Train company analysis with short lessons and quizzes. Your learning progress never affects StockBox objective ratings or User Match."}</p>
                      {investorScoreEnabled ? <p className="mt-1 text-xs text-[#7f8b9b]">{locale === "sv" ? "Investor Score finns inne i Academy och mäter endast utbildningsprogress." : "Investor Score is available inside Academy and measures learning progress only."}</p> : null}
                    </div>
                  </div>
                  <ButtonLink href="/academy">{locale === "sv" ? "Öppna Academy" : "Open Academy"} <ArrowRight className="h-4 w-4" aria-hidden="true" /></ButtonLink>
                </div>
              </Card>
            ) : null}
            {paperTradingEnabled ? (
              <Card className="mt-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <CircleDollarSign className="mt-0.5 h-5 w-5 shrink-0 text-[#e1cb95]" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-semibold text-[#f4efe5]">Paper Trading</p>
                      <p className="mt-1 text-sm leading-6 text-[#9aa7b8]">{locale === "sv" ? "Träna köp- och säljbeslut med simulerat kapital. Inga riktiga affärer eller pengar används, och StockBox fyller bara simulerade order med verifierade färska marknadspriser." : "Practice buy and sell decisions with simulated capital. No real trades or money are used, and StockBox only fills simulated orders with verified fresh market prices."}</p>
                    </div>
                  </div>
                  <ButtonLink href="/paper-trading">{locale === "sv" ? "Öppna Paper Trading" : "Open Paper Trading"} <ArrowRight className="h-4 w-4" aria-hidden="true" /></ButtonLink>
                </div>
              </Card>
            ) : null}
            <section className="mt-10"><h2 className="text-lg font-semibold text-[#f4efe5]">{copy.recentResearch}</h2>
              <div className="mt-4 overflow-hidden rounded-lg border border-white/10">
                {analyses?.length ? analyses.map((analysis) => (
                  <Link key={analysis.id} href={`/analysis/${analysis.id}`} className="grid gap-2 border-b border-white/10 bg-[#0d1c2e]/70 px-4 py-4 last:border-0 hover:bg-white/8 sm:grid-cols-[90px_1fr_120px_80px] sm:items-center">
                    <span className="font-semibold text-[#e1cb95]">{analysis.ticker}</span><span className="text-sm text-[#f4efe5]">{analysis.company_name}</span><span className="text-sm text-[#c9d2df]">{localizedResearchView(overallResearchView({ score: analysis.score, confidence: analysis.confidence, coverage: analysis.data_coverage }), locale)}</span><span className="number text-sm text-[#9aa7b8]">{analysis.score === null ? "—" : `${Math.round(analysis.score)}/100`}</span>
                  </Link>
                )) : <p className="bg-[#0d1c2e]/70 p-5 text-sm text-[#9aa7b8]">{copy.empty}</p>}
              </div>
            </section>
          </>
        )}
      </Container>
    </Section>
  );
}