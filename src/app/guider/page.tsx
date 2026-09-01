import type { Metadata } from "next";
import Link from "next/link";
import { SeoArticle, SeoHero, SeoJsonLd, SeoSection, breadcrumbJsonLd } from "@/components/seo/seo-shell";

export const metadata: Metadata = {
  title: "Guider om aktieanalys, värdering och nyckeltal",
  description: "StockBox guider för dig som vill lära dig analysera och värdera aktier, förstå nyckeltal och använda AI som researchstöd utan att tappa källkritiken.",
  alternates: { canonical: "/guider" },
};

const guides = [
  ["Hur analyserar man en aktie?", "/guider/hur-analyserar-man-en-aktie", "En steg-för-steg-process från bolagsidentitet och rapportdata till värdering, risker och slutsats."],
  ["Hur värderar man en aktie?", "/guider/hur-varderar-man-en-aktie", "Så kombinerar du multiplar, kassaflöde, tillväxt och kvalitet utan att fastna i ett enda P/E-tal."],
  ["Aktieanalysverktyg", "/aktieanalys-verktyg", "Vad ett seriöst analysverktyg bör visa om data, beräkningar, risk, källor, saknade datapunkter och uppdateringsdatum."],
  ["Nyckeltal för aktier", "/nyckeltal", "Fördjupa dig i P/E, EV/EBITDA, ROIC och fritt kassaflöde och när respektive mått är användbart."],
] as const;

export default function GuidesPage() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.getstockbox.app";
  const breadcrumbs = [{ label: "StockBox", href: "/" }, { label: "Guider", href: "/guider" }];
  const url = new URL("/guider", baseUrl).toString();

  return <>
    <SeoJsonLd data={{
      "@context": "https://schema.org",
      "@graph": [
        breadcrumbJsonLd(baseUrl, breadcrumbs),
        {
          "@type": "CollectionPage",
          "@id": `${url}#guides`,
          url,
          name: "StockBox guider om aktieanalys",
          description: metadata.description,
          inLanguage: "sv-SE",
          publisher: { "@id": `${baseUrl.replace(/\/$/, "")}/#organization` },
          hasPart: guides.map(([name, href]) => ({ "@type": "WebPage", name, url: new URL(href, baseUrl).toString() })),
        },
      ],
    }} />
    <SeoHero
      eyebrow="Investerarguider"
      title="Lär dig analysera aktier med en reproducerbar process"
      lead="Bra aktieanalys handlar mindre om att hitta en magisk siffra och mer om att kunna följa vägen från källa till datapunkt, beräkning och slutsats. Här samlar StockBox guider som gör den processen tydligare."
      breadcrumbs={breadcrumbs}
      secondaryHref="/nyckeltal"
      secondaryLabel="Se nyckeltalsguider"
    />
    <SeoArticle>
      <SeoSection title="Börja med processen, inte slutsatsen">
        <p>En robust analys börjar med rätt bolag och rätt rapportperiod. Därefter granskas verksamhetens ekonomiska utveckling, lönsamhet, kassaflöde, balansräkning, värdering och risker. Först när underlaget är begripligt blir en sammanvägd bedömning meningsfull.</p>
      </SeoSection>
      <SeoSection title="Guider">
        <div className="grid gap-4 sm:grid-cols-2">
          {guides.map(([title, href, description]) => (
            <Link key={href} href={href} className="rounded-lg border border-white/10 bg-white/[0.025] p-5 transition hover:border-[#e1cb95]/35">
              <h3 className="text-lg font-semibold text-[#f4efe5]">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-[#9aa7b8]">{description}</p>
              <p className="mt-3 text-xs font-semibold text-[#e1cb95]">Läs guiden →</p>
            </Link>
          ))}
        </div>
      </SeoSection>
      <SeoSection title="Från teori till bolag">
        <p>Vill du se hur begreppen används i praktiken kan du öppna <Link href="/aktier" className="font-semibold text-[#e1cb95] hover:text-white">publika StockBox-analyser</Link>. De publicerade sidorna visar bara datapunkter som faktiskt finns i den daterade snapshoten och länkar vidare till metodik och datakällor.</p>
      </SeoSection>
    </SeoArticle>
  </>;
}
