import { ArrowDown, CheckCircle2, FileSearch, Scale, ShieldCheck } from "lucide-react";
import { AnalysisWorkbench } from "@/components/analysis/analysis-workbench";
import { StockBoxLogo } from "@/components/brand/stockbox-logo";
import { ButtonLink } from "@/components/ui/button";
import { Container, Section } from "@/components/ui/card";
import { isFinancialProviderConfigured } from "@/lib/env/server";
import { getDictionary } from "@/lib/i18n/server";

export default async function HomePage() {
  const dictionary = await getDictionary();

  return (
    <>
      <Section className="subtle-grid border-b border-white/10 py-14 sm:py-20">
        <Container>
          <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(240px,340px)] lg:gap-14">
            <div className="max-w-4xl">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#e1cb95]">Equity research workspace</p>
              <h1 className="serif mt-5 max-w-3xl text-5xl font-semibold leading-[1.05] text-[#f4efe5] sm:text-7xl">{dictionary.marketing.heroTitle}</h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-[#c9d2df] sm:text-xl">{dictionary.marketing.heroCopy}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <ButtonLink href="#research">{dictionary.marketing.primaryCta}<ArrowDown className="h-4 w-4" aria-hidden="true" /></ButtonLink>
                <ButtonLink href="/pricing" variant="secondary">{dictionary.marketing.secondaryCta}</ButtonLink>
              </div>
            </div>
            <div className="mx-auto w-full max-w-[320px] lg:justify-self-end">
              <StockBoxLogo
                size={360}
                priority
                alt="StockBox official emblem"
                className="h-auto w-full drop-shadow-[0_24px_70px_rgba(185,155,95,0.18)]"
              />
            </div>
          </div>

          <div className="mt-10 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-white/10 bg-white/10 sm:mt-12">
            {[
              { icon: FileSearch, title: "Source-visible", copy: "Filings and market observations stay attached to every report." },
              { icon: Scale, title: "Deterministic", copy: "Ratios, scores and DCF are calculated in code, not invented in prose." },
              { icon: ShieldCheck, title: "Uncertainty included", copy: "Confidence and missing data remain part of the answer." },
            ].map((item) => (
              <div key={item.title} className="min-w-0 bg-[#081421] p-3 sm:p-5">
                <item.icon className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" />
                <p className="mt-3 text-xs font-semibold text-[#f4efe5] sm:text-base">{item.title}</p>
                <p className="mt-1 hidden text-sm leading-6 text-[#9aa7b8] sm:block">{item.copy}</p>
              </div>
            ))}
          </div>
        </Container>
      </Section>

      <Section id="research" className="py-12 sm:py-16">
        <Container>
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-[#e1cb95]">Search → analyze → understand</p>
              <h2 className="serif mt-2 text-3xl font-semibold text-[#f4efe5]">Start with a real company</h2>
            </div>
            <p className="flex max-w-md items-start gap-2 text-sm leading-6 text-[#9aa7b8]">
              <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />
              No fabricated financial data. Missing provider setup is shown honestly.
            </p>
          </div>
          <AnalysisWorkbench financialConfigured={isFinancialProviderConfigured()} />
        </Container>
      </Section>
    </>
  );
}
