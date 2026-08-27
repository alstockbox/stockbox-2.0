import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, BarChart3, Clock3, Search } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card, Container, Section } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { getUserSubscription, subscriptionBillingState } from "@/lib/billing/subscriptions";
import { createClient } from "@/lib/supabase/server";
import { getP0Copy } from "@/lib/i18n/p0-copy";
import { getLocale } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);
  const copy = getP0Copy(locale).dashboard;
  const supabase = user ? await createClient() : null;
  const [analysesResult, subscriptionLookup] = await Promise.all([
    supabase
      ? supabase.from("analyses").select("id,ticker,company_name,recommendation,score,confidence,created_at").order("created_at", { ascending: false }).limit(8)
      : Promise.resolve({ data: [] }),
    user ? getUserSubscription(user.id) : Promise.resolve(null)
  ]);
  const analyses = analysesResult.data;
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
              <Card><BarChart3 className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" /><p className="mt-3 text-xs text-[#9aa7b8]">{copy.savedAnalyses}</p><p className="number mt-1 text-3xl font-semibold">{analyses?.length ?? 0}</p></Card>
              <Card><Clock3 className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" /><p className="mt-3 text-xs text-[#9aa7b8]">{copy.currentAccess}</p><p className="mt-1 text-xl font-semibold">{planLabel}</p><Link href={billingState === "basic" || billingState === "basic_manage" ? "/settings/billing" : "/pricing"} className="mt-3 inline-flex text-xs font-semibold text-[#e1cb95] hover:text-white">{billingState === "basic_manage" ? copy.resolveBilling : billingState === "basic" ? copy.managePlan : copy.viewPlans}</Link></Card>
              <Card><Search className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" /><p className="mt-3 text-xs text-[#9aa7b8]">{copy.defaultWorkflow}</p><p className="mt-1 text-xl font-semibold">{copy.workflow}</p></Card>
            </div>
            <section className="mt-10"><h2 className="text-lg font-semibold text-[#f4efe5]">{copy.recentResearch}</h2>
              <div className="mt-4 overflow-hidden rounded-lg border border-white/10">
                {analyses?.length ? analyses.map((analysis) => (
                  <Link key={analysis.id} href={`/analysis/${analysis.id}`} className="grid gap-2 border-b border-white/10 bg-[#0d1c2e]/70 px-4 py-4 last:border-0 hover:bg-white/8 sm:grid-cols-[90px_1fr_120px_80px] sm:items-center">
                    <span className="font-semibold text-[#e1cb95]">{analysis.ticker}</span><span className="text-sm text-[#f4efe5]">{analysis.company_name}</span><span className="text-sm text-[#c9d2df]">{analysis.recommendation}</span><span className="number text-sm text-[#9aa7b8]">{analysis.score}/100</span>
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
