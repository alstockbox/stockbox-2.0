import type { Metadata } from "next";
import Link from "next/link";
import { AnalysisWorkbench } from "@/components/analysis/analysis-workbench";
import { analysisWorkbenchDefaults } from "@/components/analysis/analysis-workbench-state";
import { Container, Section } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { getUserAnalysisHistory } from "@/lib/db/repositories";
import { isFinancialProviderConfigured } from "@/lib/env/server";
import { getP0Copy } from "@/lib/i18n/p0-copy";
import { getLocale } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Analyze", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AnalyzePage() {
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);
  const copy = getP0Copy(locale).analyze;
  const supabase = user ? await createClient() : null;
  const [profileResult, historyResult] = await Promise.all([
    supabase ? supabase.from("profiles").select("ui_mode,investment_profile,experience").eq("id", user!.id).maybeSingle() : Promise.resolve({ data: null }),
    user ? getUserAnalysisHistory({ userId: user.id, page: 1, pageSize: 5 }) : Promise.resolve({ ok: true as const, data: [], count: 0 }),
  ]);
  const recentAnalyses = historyResult.ok ? historyResult.data : [];
  const defaults = analysisWorkbenchDefaults(profileResult.data ? { uiMode: profileResult.data.ui_mode, investmentProfile: profileResult.data.investment_profile, experience: profileResult.data.experience } : null);
  return <Section><Container>
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-[#e1cb95]">{copy.kicker}</p><h1 className="serif mt-2 text-3xl font-semibold text-[#f4efe5]">{copy.title}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[#9aa7b8]">{copy.copy}</p></div>{user ? <Link href="/history" className="text-sm font-semibold text-[#e1cb95] hover:text-white">{locale === "sv" ? "Alla sparade analyser →" : "All saved analyses →"}</Link> : null}</div>
    {recentAnalyses.length ? <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{recentAnalyses.map((item) => <Link key={item.id} href={`/analysis/${item.id}`} className="rounded-lg border border-white/10 bg-white/[0.03] p-3 hover:bg-white/[0.06]"><p className="font-mono text-xs text-[#e1cb95]">{item.ticker}</p><p className="mt-1 truncate text-sm font-semibold text-[#f4efe5]">{item.company_name}</p><p className="mt-2 text-xs text-[#9aa7b8]">{item.recommendation ?? "No Rating"} · {item.score ?? "—"}/100</p></Link>)}</div> : null}
    <div className="mt-8"><AnalysisWorkbench financialConfigured={isFinancialProviderConfigured()} initialMode={defaults.mode} initialInvestmentProfile={defaults.investmentProfile} locale={locale} /></div>
  </Container></Section>;
}
