import type { Metadata } from "next";
import Link from "next/link";
import { SeoArticle, SeoHero, SeoJsonLd, SeoSection, breadcrumbJsonLd } from "@/components/seo/seo-shell";

export const metadata: Metadata = {
  title: "Fundamental analys av aktier – guide och verktyg",
  description: "Lär dig fundamental analys av aktier: värdering, tillväxt, lönsamhet, kassaflöde, finansiell hälsa, kvalitet och risk med StockBox.",
  alternates: { canonical: "/fundamental-analys" },
};

export default function FundamentalAnalysisPage() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.getstockbox.app";
  const breadcrumbs = [{ label: "StockBox", href: "/" }, { label: "Fundamental analys", href: "/fundamental-analys" }];
  return <>
    <SeoJsonLd data={{ "@context": "https://schema.org", "@graph": [breadcrumbJsonLd(baseUrl, breadcrumbs), { "@type": "WebPage", name: "Fundamental analys av aktier", url: new URL("/fundamental-analys", baseUrl).toString(), description: metadata.description, publisher: { "@id": `${baseUrl.replace(/\/$/, "")}/#organization` } }] }} />
    <SeoHero eyebrow="Fundamental analys" title="Fundamental analys av aktier – från bolagets siffror till en helhetsbild" lead="Fundamental analys försöker förstå verksamhetens ekonomiska kvalitet och relationen mellan pris och fundamenta. StockBox strukturerar analysen så att värdering aldrig bedöms isolerat från tillväxt, lönsamhet, kassaflöde, balansräkning och risk." breadcrumbs={breadcrumbs} />
    <SeoArticle>
      <SeoSection title="Värdering"><p>Värderingsmått som P/E, EV/EBITDA, EV/Sales och kassaflödesyield kan ge viktig kontext. Men ett lågt multipelvärde är inte automatiskt attraktivt om vinsten faller, skuldsättningen ökar eller affärens kvalitet försämras.</p><p><Link href="/nyckeltal/pe-tal" className="font-semibold text-[#e1cb95] hover:text-white">Fördjupa dig i P/E-tal →</Link></p></SeoSection>
      <SeoSection title="Tillväxt och lönsamhet"><p>Omsättnings- och vinsttillväxt behöver sättas i relation till marginaler och kapitalanvändning. Hög tillväxt med försämrade marginaler kan betyda något helt annat än hög tillväxt med stabil eller förbättrad lönsamhet.</p></SeoSection>
      <SeoSection title="Kassaflöde och finansiell hälsa"><p>Kassaflödet hjälper till att bedöma hur redovisad vinst omsätts i verklig likviditet. Samtidigt visar skuldsättning, räntetäckning och balansräkning hur motståndskraftigt bolaget kan vara om förutsättningarna försämras.</p></SeoSection>
      <SeoSection title="Kvalitet och risk"><p>En fundamental analys bör även fånga faktorer som kapitalavkastning, vinstkvalitet, utspädning, cyklikalitet och datakvalitet. StockBox visar därför både score-dimensioner och rapportens egen konfidens i stället för ett frikopplat slutsvar.</p></SeoSection>
      <SeoSection title="Gör analysen reproducerbar"><p>StockBox visar metodik, datakällor och saknade datapunkter så att du kan granska hur slutsatsen byggdes. Börja med <Link href="/aktieanalys" className="font-semibold text-[#e1cb95] hover:text-white">guiden till aktieanalys</Link> eller se <Link href="/aktier" className="font-semibold text-[#e1cb95] hover:text-white">publika bolagsanalyser</Link>.</p></SeoSection>
    </SeoArticle>
  </>;
}
