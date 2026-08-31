import type { Metadata } from "next";
import { BarChart3, BookOpenCheck, GitCompareArrows, History, Search, ShieldCheck } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card, Container, Section } from "@/components/ui/card";
import { getLocale } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Product — Stock research workspace",
  description: "Analyze, compare and track stocks with source-visible fundamentals, historical context, confidence, coverage and investor-specific research views.",
  alternates: { canonical: "/product" },
};

const features = [
  { icon: Search, en: "Analyze", sv: "Analysera", enText: "Resolve the listed company, inspect fundamentals, valuation, quality, financial health and risk, then keep missing data explicit.", svText: "Identifiera rätt noterat bolag, granska fundamenta, värdering, kvalitet, finansiell hälsa och risk — med saknad data tydligt markerad." },
  { icon: History, en: "Historical context", sv: "Historisk kontext", enText: "Use reported history and dated snapshots to understand how a company and its StockBox research view change over time.", svText: "Använd rapporterad historik och daterade snapshots för att förstå hur bolaget och StockBox researchvy förändras över tid." },
  { icon: GitCompareArrows, en: "Compare", sv: "Jämför", enText: "Place saved company snapshots side by side without rewriting their original inputs, scores or source dates.", svText: "Jämför sparade bolagssnapshots sida vid sida utan att skriva om deras ursprungliga indata, poäng eller källdatum." },
  { icon: BarChart3, en: "Simple or Pro", sv: "Simple eller Pro", enText: "Simple mode prioritizes interpretation. Pro mode exposes more metrics, score contributors, provenance and model detail.", svText: "Simple prioriterar förståelse. Pro visar fler nyckeltal, score-bidrag, proveniens och modelldetaljer." },
  { icon: BookOpenCheck, en: "Investor profiles", sv: "Investerarprofiler", enText: "Balanced, long-term, growth, value, quality and dividend profiles change weighting and emphasis — never the underlying facts.", svText: "Balanced, long-term, growth, value, quality och dividend ändrar viktning och fokus — aldrig de underliggande fakta." },
  { icon: ShieldCheck, en: "Confidence & coverage", sv: "Konfidens & täckning", enText: "See how much weighted evidence was available, what is missing and why confidence is high or limited.", svText: "Se hur stor del av det viktade underlaget som fanns, vad som saknas och varför konfidensen är hög eller begränsad." },
] as const;

export default async function ProductPage() {
  const locale = await getLocale();
  const sv = locale === "sv";
  return <>
    <Section className="border-b border-white/10 pb-12 pt-16">
      <Container className="max-w-5xl">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#e1cb95]">{sv ? "Produkten" : "The product"}</p>
        <h1 className="serif mt-3 max-w-4xl text-4xl font-semibold leading-tight text-[#f4efe5] sm:text-5xl">{sv ? "En researchplattform för att förstå, jämföra och följa aktier" : "A research workspace to understand, compare and track stocks"}</h1>
        <p className="mt-5 max-w-3xl text-base leading-7 text-[#c9d2df]">{sv ? "StockBox kombinerar verifierbar finansiell data med versionsstyrd analyslogik. Du ser underlaget, datatäckningen och osäkerheten — inte bara en genererad text." : "StockBox combines verifiable financial data with versioned analysis logic. You see the evidence, data coverage and uncertainty — not just generated prose."}</p>
        <div className="mt-7 flex flex-wrap gap-3"><ButtonLink href="/auth/signup">{sv ? "Analysera gratis" : "Analyze free"}</ButtonLink><ButtonLink href="/sample-analysis" variant="secondary">{sv ? "Se exempelanalys" : "View sample analysis"}</ButtonLink></div>
      </Container>
    </Section>
    <Section>
      <Container>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{features.map((feature) => <Card key={feature.en}>
          <feature.icon className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" />
          <h2 className="mt-3 text-lg font-semibold text-[#f4efe5]">{sv ? feature.sv : feature.en}</h2>
          <p className="mt-2 text-sm leading-6 text-[#9aa7b8]">{sv ? feature.svText : feature.enText}</p>
        </Card>)}</div>
      </Container>
    </Section>
    <Section className="pt-0">
      <Container className="grid gap-5 lg:grid-cols-2">
        <Card><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#e1cb95]">{sv ? "Trust" : "Trust"}</p><h2 className="mt-2 text-2xl font-semibold text-[#f4efe5]">{sv ? "Data och modell hålls isär" : "Data and model judgment stay separate"}</h2><p className="mt-3 text-sm leading-7 text-[#9aa7b8]">{sv ? "Rapporter visar källor, perioder, valuta, täckning och saknade datapunkter. StockBox hittar inte på finansiella värden för att fylla luckor." : "Reports expose sources, periods, currency, coverage and missing datapoints. StockBox does not invent financial values to fill gaps."}</p><ButtonLink href="/data-sources" variant="ghost" className="mt-4 px-0">{sv ? "Se datakällor" : "See data sources"}</ButtonLink></Card>
        <Card><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#e1cb95]">{sv ? "Metodik" : "Methodology"}</p><h2 className="mt-2 text-2xl font-semibold text-[#f4efe5]">{sv ? "Förstå varför poängen blev som den blev" : "Understand why the score looks the way it does"}</h2><p className="mt-3 text-sm leading-7 text-[#9aa7b8]">{sv ? "Dimensioner, viktning, bolagsarketyp, investerarprofil, confidence och coverage är versionsstyrda och granskningsbara." : "Dimensions, weighting, company archetype, investor profile, confidence and coverage are versioned and inspectable."}</p><ButtonLink href="/docs/methodology" variant="ghost" className="mt-4 px-0">{sv ? "Läs metodiken" : "Read methodology"}</ButtonLink></Card>
      </Container>
    </Section>
  </>;
}
