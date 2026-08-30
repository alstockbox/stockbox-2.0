import type { Metadata } from "next";
import Link from "next/link";
import { AnalysisWorkbench } from "@/components/analysis/analysis-workbench";
import { ButtonLink } from "@/components/ui/button";
import { Card, Container, Section } from "@/components/ui/card";
import { isFinancialProviderConfigured } from "@/lib/env/server";
import { getLocale } from "@/lib/i18n/server";
import { getMarketingCopy } from "@/lib/i18n/marketing-copy";

export const metadata: Metadata = {
  title: "Source-backed stock analysis and equity research",
  description: "Analyze stocks with source-backed fundamentals, valuation, growth, financial health, quality and risk. Missing financial data is never fabricated.",
};

const sampleDimensions = [["Valuation", 28], ["Growth", 36], ["Profitability", 85], ["Financial health", 69], ["Quality", 100], ["Risk", 56]] as const;

export default async function HomePage() {
  const locale = await getLocale();
  const copy = getMarketingCopy(locale);
  const sv = locale === "sv";
  return (
    <>
      <Section className="pb-8 pt-16 sm:pt-20">
        <Container>
          <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_.95fr]">
            <div>
              <p className="text-sm font-semibold text-[#e1cb95]">{copy.kicker}</p>
              <h1 className="serif mt-3 max-w-4xl text-4xl font-semibold leading-tight text-[#f4efe5] sm:text-5xl lg:text-6xl">{copy.heroTitle}</h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-[#aeb8c7] sm:text-lg">{copy.heroCopy}</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <ButtonLink href="/auth/signup">{copy.primaryCta}</ButtonLink>
                <ButtonLink href="/sample-analysis" variant="secondary">{copy.sampleCta}</ButtonLink>
              </div>
              <p className="mt-5 text-xs leading-6 text-[#7f8b9b]">{sv ? "Ingen handel. Ingen individanpassad rådgivning. Rapportens datatäckning och konfidens visas öppet." : "No trade execution. No individualized financial advice. Report coverage and confidence stay visible."}</p>
            </div>
            <Card className="border-[#e1cb95]/25 bg-[#0b1829] p-0">
              <div className="border-b border-white/10 p-5">
                <div className="flex items-center justify-between gap-3"><div><p className="font-mono text-sm text-[#e1cb95]">AAPL</p><h2 className="mt-1 text-xl font-semibold text-[#f4efe5]">Apple Inc.</h2></div><span className="rounded-full border border-[#e1cb95]/30 px-3 py-1 text-xs font-semibold text-[#e1cb95]">Hold</span></div>
                <div className="mt-5 grid grid-cols-3 gap-3"><div><p className="text-xs text-[#7f8b9b]">Score</p><p className="number mt-1 text-2xl font-semibold">66.5</p></div><div><p className="text-xs text-[#7f8b9b]">Confidence</p><p className="number mt-1 text-2xl font-semibold">90%</p></div><div><p className="text-xs text-[#7f8b9b]">Coverage</p><p className="number mt-1 text-2xl font-semibold">89.7%</p></div></div>
              </div>
              <div className="grid gap-3 p-5 sm:grid-cols-2">
                {sampleDimensions.map(([label, score]) => <div key={label}><div className="flex justify-between text-xs"><span className="text-[#c9d2df]">{label}</span><span className="number text-[#e1cb95]">{score}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-[#b99b5f]" style={{ width: `${score}%` }} /></div></div>)}
              </div>
              <div className="border-t border-white/10 px-5 py-4 text-xs text-[#7f8b9b]">{sv ? "Riktig snapshot · Engine v2.7.0 · 30 aug 2026" : "Real snapshot · Engine v2.7.0 · 30 Aug 2026"}</div>
            </Card>
          </div>
        </Container>
      </Section>

      <Section id="product" className="py-10">
        <Container>
          <div className="grid gap-4 md:grid-cols-3">
            {[ [copy.sourceTitle, copy.sourceCopy], [copy.deterministicTitle, copy.deterministicCopy], [copy.missingTitle, copy.missingCopy] ].map(([title, text]) => <Card key={title}><h2 className="text-lg font-semibold text-[#f4efe5]">{title}</h2><p className="mt-2 text-sm leading-6 text-[#9aa7b8]">{text}</p></Card>)}
          </div>
        </Container>
      </Section>
      <Section className="py-10">
        <Container className="grid gap-8 lg:grid-cols-[.7fr_1.3fr]">
          <div>
            <p className="text-sm font-semibold text-[#e1cb95]">{sv ? "Så fungerar det" : "How it works"}</p>
            <h2 className="serif mt-2 text-3xl font-semibold text-[#f4efe5]">{sv ? "Sök, analysera, granska underlaget" : "Search, analyze, inspect the evidence"}</h2>
            <p className="mt-4 text-sm leading-7 text-[#9aa7b8]">{sv ? "Välj ett riktigt börsnoterat bolag. StockBox identifierar rätt värdepapper, bygger rapporten från tillgänglig verifierbar data och visar tydligt när täckningen inte räcker." : "Choose a real listed company. StockBox resolves the security, builds the report from available verifiable data and clearly shows when coverage is not sufficient."}</p>
            <div className="mt-5 flex flex-wrap gap-4 text-sm"><Link href="/data-sources" className="font-semibold text-[#e1cb95] hover:text-white">{sv ? "Datakällor" : "Data sources"}</Link><Link href="/docs/methodology" className="font-semibold text-[#e1cb95] hover:text-white">{sv ? "Metodik" : "Methodology"}</Link><Link href="/faq" className="font-semibold text-[#e1cb95] hover:text-white">FAQ</Link></div>
          </div>
          <AnalysisWorkbench financialConfigured={isFinancialProviderConfigured()} initialMode="simple" initialInvestmentProfile="balanced" locale={locale} />
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
