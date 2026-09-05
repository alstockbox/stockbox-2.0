import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FileSearch, Scale, ShieldCheck } from "lucide-react";
import { AnalysisWorkbench } from "@/components/analysis/analysis-workbench";
import { StockBoxLogo } from "@/components/brand/stockbox-logo";
import { PublicAnalysisPreview } from "@/components/landing/public-analysis-preview";
import { ButtonLink } from "@/components/ui/button";
import { Card, Container, Section } from "@/components/ui/card";
import { captureServerEvent } from "@/lib/analytics/events";
import { getCurrentUser } from "@/lib/auth/session";
import { isFinancialProviderConfigured } from "@/lib/env/server";
import { getLocale } from "@/lib/i18n/server";
import { getMarketingCopy } from "@/lib/i18n/marketing-copy";

export const metadata: Metadata = {
  title: "Data-driven stock analysis and equity research",
  description: "Analyze stocks with data-driven fundamentals, valuation, growth, financial health, quality and risk. Sources remain visible and missing financial data is never fabricated.",
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  captureServerEvent("homepage_view");
  captureServerEvent("landing_view");
  const [locale, user] = await Promise.all([getLocale(), getCurrentUser()]);
  const copy = getMarketingCopy(locale);
  const sv = locale === "sv";
  const videoUrl = process.env.NEXT_PUBLIC_INTRO_VIDEO_URL?.trim() || null;
  const trustCards = [
    { icon: FileSearch, title: copy.sourceTitle, text: copy.sourceCopy },
    { icon: Scale, title: copy.deterministicTitle, text: copy.deterministicCopy },
    { icon: ShieldCheck, title: copy.missingTitle, text: copy.missingCopy },
  ] as const;

  return (
    <>
      <Section className="subtle-grid border-b border-white/10 pb-10 pt-10 sm:pt-14 lg:pt-16">
        <Container>
          <div className="grid items-start gap-8 lg:grid-cols-[.92fr_1.08fr] lg:gap-10">
            <div className="lg:pt-5">
              <div className="flex items-center gap-3">
                <StockBoxLogo size={56} alt="" priority className="h-12 w-12 sm:h-14 sm:w-14" />
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#e1cb95] sm:text-sm">{sv ? "Aktieanalys utan informationskaos" : "Stock research without information overload"}</p>
              </div>
              <h1 className="serif mt-5 max-w-3xl text-4xl font-semibold leading-[1.08] text-[#f4efe5] sm:text-5xl lg:text-[3.5rem]">
                {sv ? "Förstå en aktie snabbare — med data, score och tydliga risker på ett ställe." : "Understand a stock faster — with data, scores and clear risks in one place."}
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-[#c9d2df] sm:text-lg">
                {sv ? "StockBox samlar verifierbar bolags- och marknadsdata, räknar fram värdering, tillväxt, lönsamhet, finansiell hälsa, kvalitet, risk och momentum och visar vad underlaget faktiskt räcker till." : "StockBox combines verifiable company and market data, calculates valuation, growth, profitability, financial health, quality, risk and momentum, and shows what the evidence actually supports."}
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <ButtonLink href="#free-analysis" className="min-h-12 px-5 text-base">
                  {sv ? "Gör en gratis analys" : "Run a free analysis"}<ArrowRight className="h-4 w-4" aria-hidden="true" />
                </ButtonLink>
                <Link href="/auth/signup?next=/analyze" className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-[#c9d2df] hover:text-white">
                  {sv ? "Skapa gratis konto" : "Create free account"}
                </Link>
              </div>
              <div className="mt-6 grid max-w-xl grid-cols-3 gap-2 text-xs sm:gap-3 sm:text-sm">
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3"><p className="font-semibold text-[#f4efe5]">9</p><p className="mt-1 text-[#8f9bac]">{sv ? "analysdimensioner" : "analysis dimensions"}</p></div>
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3"><p className="font-semibold text-[#f4efe5]">{sv ? "Synligt" : "Visible"}</p><p className="mt-1 text-[#8f9bac]">{sv ? "datatäckning" : "data coverage"}</p></div>
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3"><p className="font-semibold text-[#f4efe5]">{sv ? "Källor" : "Sources"}</p><p className="mt-1 text-[#8f9bac]">{sv ? "i rapporten" : "in the report"}</p></div>
              </div>
              <p className="mt-5 max-w-2xl text-xs leading-6 text-[#7f8b9b]">{sv ? "StockBox är analysstöd, inte personlig investeringsrådgivning eller en garanti om framtida avkastning. Datatäckning och konfidens visas öppet." : "StockBox is research support, not individualized investment advice or a guarantee of future returns. Data coverage and confidence remain visible."}</p>
            </div>
            <PublicAnalysisPreview locale={locale} videoUrl={videoUrl} />
          </div>
        </Container>
      </Section>

      <Section id="product" className="py-9 sm:py-10">
        <Container>
          <div className="grid gap-4 md:grid-cols-3">
            {trustCards.map((item) => (
              <Card key={item.title}>
                <item.icon className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" />
                <h2 className="mt-3 text-lg font-semibold text-[#f4efe5]">{item.title}</h2>
                <p className="mt-2 text-sm leading-6 text-[#9aa7b8]">{item.text}</p>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      <Section id="research" className="py-10">
        <Container className="grid gap-8 lg:grid-cols-[.7fr_1.3fr]">
          <div>
            <p className="text-sm font-semibold text-[#e1cb95]">{sv ? "Från snabb överblick till full research" : "From fast overview to full research"}</p>
            <h2 className="serif mt-2 text-3xl font-semibold text-[#f4efe5]">{sv ? "Sök, analysera och granska underlaget" : "Search, analyze and inspect the evidence"}</h2>
            <p className="mt-4 text-sm leading-7 text-[#9aa7b8]">{sv ? "StockBox identifierar rätt börsnoterade värdepapper, bygger analysen från tillgänglig verifierbar data och markerar tydligt när data saknas i stället för att fylla hålen med påhittade värden." : "StockBox resolves the correct listed security, builds research from available verifiable data and marks missing data clearly instead of filling gaps with fabricated values."}</p>
            <div className="mt-5 flex flex-wrap gap-4 text-sm"><Link href="/data-sources" className="font-semibold text-[#e1cb95] hover:text-white">{sv ? "Datakällor" : "Data sources"}</Link><Link href="/docs/methodology" className="font-semibold text-[#e1cb95] hover:text-white">{sv ? "Metodik" : "Methodology"}</Link><Link href="/sample-analysis" className="font-semibold text-[#e1cb95] hover:text-white">{sv ? "Exempelanalys" : "Sample analysis"}</Link></div>
          </div>
          {user ? (
            <AnalysisWorkbench financialConfigured={isFinancialProviderConfigured()} initialMode="simple" initialInvestmentProfile="balanced" locale={locale} />
          ) : (
            <Card className="flex min-h-64 flex-col justify-center border-[#e1cb95]/20 bg-[#0b1829] p-6 sm:p-8">
              <p className="text-sm font-semibold text-[#e1cb95]">{sv ? "Full funktionalitet" : "Full functionality"}</p>
              <h3 className="serif mt-2 text-2xl font-semibold text-[#f4efe5]">{sv ? "Spara analyser, bygg historik och arbeta vidare i din workspace." : "Save analyses, build history and continue in your workspace."}</h3>
              <p className="mt-3 text-sm leading-6 text-[#9aa7b8]">{sv ? "Testa gratisanalysen ovan först. När du vill spara resultatet eller fortsätta med fler verktyg skapar du ett gratis konto." : "Try the free preview above first. Create a free account when you want to save work or continue with the full toolset."}</p>
              <ButtonLink href="/auth/signup?next=/analyze" className="mt-5 w-fit">{sv ? "Skapa gratis konto" : "Create free account"}</ButtonLink>
            </Card>
          )}
        </Container>
      </Section>

      <Section className="pt-6">
        <Container className="rounded-xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
          <h2 className="serif text-3xl font-semibold text-[#f4efe5]">{copy.proofTitle}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[#9aa7b8]">{copy.proofCopy}</p>
          <ButtonLink href="/sample-analysis" variant="secondary" className="mt-5">{copy.sampleCta}</ButtonLink>
        </Container>
      </Section>
    </>
  );
}
