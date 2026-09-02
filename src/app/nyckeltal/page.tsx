import type { Metadata } from "next";
import Link from "next/link";
import { SeoArticle, SeoHero, SeoJsonLd, SeoSection, breadcrumbJsonLd } from "@/components/seo/seo-shell";

export const metadata: Metadata = {
  title: "Nyckeltal för aktier – P/E, EV/EBITDA, ROIC & kassaflöde",
  description: "Guide till viktiga nyckeltal för aktieanalys: P/E, EV/EBITDA, ROIC och fritt kassaflöde. Lär dig vad måtten visar och när de kan missleda.",
  alternates: { canonical: "/nyckeltal" },
};

const metrics = [
  { href: "/nyckeltal/pe-tal", title: "P/E-tal", text: "Jämför aktiekursen med vinst per aktie och förstå varför låg multipel inte alltid betyder billig aktie." },
  { href: "/nyckeltal/ev-ebitda", title: "EV/EBITDA", text: "Sätter bolagets rörelsevärde i relation till EBITDA och gör kapitalstruktur mer synlig än P/E." },
  { href: "/nyckeltal/roic", title: "ROIC", text: "Mäter hur effektivt bolaget genererar rörelseresultat på kapitalet som faktiskt är investerat i verksamheten." },
  { href: "/nyckeltal/fritt-kassaflode", title: "Fritt kassaflöde", text: "Visar hur mycket kassaflöde verksamheten lämnar efter investeringar och ger viktig kontext till redovisad vinst." },
] as const;

export default function KeyMetricsPage() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.getstockbox.app";
  const breadcrumbs = [{ label: "StockBox", href: "/" }, { label: "Nyckeltal", href: "/nyckeltal" }];
  const pageUrl = new URL("/nyckeltal", baseUrl).toString();
  return <>
    <SeoJsonLd data={{ "@context": "https://schema.org", "@graph": [breadcrumbJsonLd(baseUrl, breadcrumbs), { "@type": "CollectionPage", name: "Nyckeltal för aktieanalys", url: pageUrl, description: metadata.description, publisher: { "@id": `${baseUrl.replace(/\/$/, "")}/#organization` }, hasPart: metrics.map((metric) => ({ "@type": "WebPage", name: metric.title, url: new URL(metric.href, baseUrl).toString() })) }] }} />
    <SeoHero eyebrow="Nyckeltal" title="Nyckeltal för aktieanalys – förstå vad siffrorna faktiskt säger" lead="En bra aktieanalys bygger sällan på ett enda nyckeltal. StockBox kombinerar värdering, tillväxt, lönsamhet, kassaflöde, kapitalavkastning, finansiell hälsa och risk – och visar när underlaget inte räcker." breadcrumbs={breadcrumbs} secondaryHref="/fundamental-analys" secondaryLabel="Guide till fundamental analys" />
    <SeoArticle>
      <SeoSection title="Fyra nyckeltal att förstå först">
        <div className="grid gap-4 sm:grid-cols-2">{metrics.map((metric) => <Link key={metric.href} href={metric.href} className="rounded-lg border border-white/10 bg-white/[0.025] p-5 transition hover:border-[#e1cb95]/35 hover:bg-white/[0.04]"><h3 className="text-lg font-semibold text-[#f4efe5]">{metric.title}</h3><p className="mt-2 text-sm leading-6 text-[#9aa7b8]">{metric.text}</p></Link>)}</div>
      </SeoSection>
      <SeoSection title="Varför flera mått behövs samtidigt"><p>P/E kan se attraktivt ut samtidigt som skuldsättningen är hög. EV/EBITDA kan se lågt ut trots stora investeringsbehov. Hög ROIC kan vara mycket positivt men behöver förstås tillsammans med tillväxt och konkurrensfördelar. Starkt fritt kassaflöde kan i sin tur vara tillfälligt. Därför blir kombinationen av mått viktigare än en enskild siffra.</p></SeoSection>
      <SeoSection title="Jämför rätt bolag med rätt mått"><p>Olika branscher har olika ekonomiska modeller. Banker, försäkringsbolag och fastighetsbolag kan behöva specialiserade mått, medan industribolag och mjukvarubolag ofta analyseras med andra kombinationer. StockBox försöker därför anpassa analyslogiken efter bolagstyp i stället för att använda exakt samma mall överallt.</p></SeoSection>
      <SeoSection title="Från nyckeltal till bolagsanalys"><p>Nyckeltal är bäst när de sätts i kontext med historik, peers, datakvalitet och affärens utveckling. Se <Link href="/aktier" className="font-semibold text-[#e1cb95] hover:text-white">publika StockBox-analyser</Link> eller läs hur en fullständig <Link href="/aktieanalys" className="font-semibold text-[#e1cb95] hover:text-white">aktieanalys</Link> byggs.</p></SeoSection>
    </SeoArticle>
  </>;
}
