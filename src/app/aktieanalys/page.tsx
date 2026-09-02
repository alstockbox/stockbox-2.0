import type { Metadata } from "next";
import Link from "next/link";
import { SeoArticle, SeoHero, SeoJsonLd, SeoSection, breadcrumbJsonLd } from "@/components/seo/seo-shell";

export const metadata: Metadata = {
  title: "Aktieanalys online – analysera aktier med data",
  description: "Gör aktieanalys med StockBox. Granska värdering, tillväxt, lönsamhet, finansiell hälsa, kvalitet och risk med synliga källor och StockBox Score.",
  alternates: { canonical: "/aktieanalys" },
};

export default function StockAnalysisSeoPage() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.getstockbox.app";
  const breadcrumbs = [{ label: "StockBox", href: "/" }, { label: "Aktieanalys", href: "/aktieanalys" }];
  return <>
    <SeoJsonLd data={{ "@context": "https://schema.org", "@graph": [breadcrumbJsonLd(baseUrl, breadcrumbs), { "@type": "WebPage", name: "Aktieanalys online", url: new URL("/aktieanalys", baseUrl).toString(), description: metadata.description, publisher: { "@id": `${baseUrl.replace(/\/$/, "")}/#organization` } }] }} />
    <SeoHero eyebrow="Aktieanalys" title="Aktieanalys online med verifierbara data" lead="StockBox hjälper dig att analysera en aktie strukturerat: från värdering och tillväxt till lönsamhet, balansräkning, kvalitet och risk. Källor, datatäckning och konfidens visas i stället för att luckor fylls med påhittade siffror." breadcrumbs={breadcrumbs} />
    <SeoArticle>
      <SeoSection title="Vad är en aktieanalys?"><p>En aktieanalys försöker förstå bolagets ekonomi, kvalitet, risker och värdering innan en investerare fattar sitt eget beslut. En bra analys tittar därför inte på ett enda nyckeltal utan kombinerar flera perspektiv.</p><p>StockBox delar upp underlaget i bland annat värdering, tillväxt, lönsamhet, finansiell hälsa, kvalitet och risk. Resultatet sammanfattas i en modellbaserad StockBox Score tillsammans med datatäckning och konfidens.</p></SeoSection>
      <SeoSection title="Så analyserar StockBox en aktie"><ol className="list-decimal space-y-2 pl-5"><li>Identifierar rätt börsnotering och bolag.</li><li>Hämtar tillgängliga finansiella rapportdata och marknadsdata.</li><li>Beräknar nyckeltal med versionsstyrd modellogik.</li><li>Bedömer flera dimensioner i stället för ett ensamt köp/sälj-svar.</li><li>Visar källor, saknad data, datatäckning och konfidens.</li></ol></SeoSection>
      <SeoSection title="Aktieanalys handlar om mer än P/E"><p>P/E kan ge snabb värderingskontext men säger inte ensamt om en aktie är billig. Tillväxt, marginaler, kassaflöde, skuldsättning och bolagets kvalitet avgör hur ett värderingsmultipel bör tolkas.</p><p><Link href="/nyckeltal/pe-tal" className="font-semibold text-[#e1cb95] hover:text-white">Läs guiden till P/E-tal</Link> eller gå vidare till <Link href="/fundamental-analys" className="font-semibold text-[#e1cb95] hover:text-white">fundamental analys</Link>.</p></SeoSection>
      <SeoSection title="Se riktiga publika analyser"><p>StockBox kan publicera kvalitetssäkrade analyssnapshots för enskilda bolag. De bygger på faktiska rapporter och publiceras bara när minimikrav för aktualitet, konfidens och datatäckning är uppfyllda.</p><p><Link href="/aktier" className="font-semibold text-[#e1cb95] hover:text-white">Utforska publika aktieanalyser →</Link></p></SeoSection>
    </SeoArticle>
  </>;
}
