import type { Metadata } from "next";
import Link from "next/link";
import { SeoArticle, SeoHero, SeoJsonLd, SeoSection, breadcrumbJsonLd } from "@/components/seo/seo-shell";

export const metadata: Metadata = {
  title: "P/E-tal – vad betyder P/E och när är det användbart?",
  description: "Lär dig vad P/E-tal betyder, hur P/E räknas ut och varför ett lågt P/E inte automatiskt innebär att en aktie är billig. StockBox guide till P/E.",
  alternates: { canonical: "/nyckeltal/pe-tal" },
};

export default function PeRatioPage() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.getstockbox.app";
  const breadcrumbs = [{ label: "StockBox", href: "/" }, { label: "Nyckeltal", href: "/fundamental-analys" }, { label: "P/E-tal", href: "/nyckeltal/pe-tal" }];
  return <>
    <SeoJsonLd data={{ "@context": "https://schema.org", "@graph": [breadcrumbJsonLd(baseUrl, breadcrumbs), { "@type": "WebPage", name: "P/E-tal", url: new URL("/nyckeltal/pe-tal", baseUrl).toString(), description: metadata.description, publisher: { "@id": `${baseUrl.replace(/\/$/, "")}/#organization` } }] }} />
    <SeoHero eyebrow="Nyckeltal" title="P/E-tal: vad betyder P/E och hur ska det tolkas?" lead="P/E är ett av börsens mest använda värderingsmått. Det jämför aktiekursen med bolagets vinst per aktie, men behöver alltid tolkas tillsammans med tillväxt, lönsamhet, kvalitet, skuldsättning och vinstens hållbarhet." breadcrumbs={breadcrumbs} secondaryHref="/fundamental-analys" secondaryLabel="Läs om fundamental analys" />
    <SeoArticle>
      <SeoSection title="Hur räknas P/E-tal ut?"><p><strong className="text-[#f4efe5]">P/E = aktiekurs / vinst per aktie (EPS).</strong> Om en aktie kostar 200 kr och vinsten per aktie är 10 kr blir P/E 20. Det betyder inte att investeraren bokstavligen får tillbaka investeringen på 20 år; måttet är en värderingsrelation, inte en återbetalningsplan.</p></SeoSection>
      <SeoSection title="Är ett lågt P/E-tal alltid bra?"><p>Nej. Ett lågt P/E kan spegla en attraktiv värdering, men det kan också spegla fallande vinster, cyklisk toppvinst, hög skuldsättning, strukturella problem eller låg förväntad tillväxt. Därför behandlar StockBox inte automatiskt lägre P/E som bättre.</p></SeoSection>
      <SeoSection title="När fungerar P/E dåligt?"><p>P/E blir särskilt svårt att tolka när vinsten är negativ, mycket volatil eller tillfälligt ovanligt hög eller låg. För vissa bolagstyper kan andra nyckeltal och specialiserade modeller vara mer relevanta. Saknas ett meningsfullt P/E ska StockBox hellre visa att måttet inte är användbart än skapa ett värde.</p></SeoSection>
      <SeoSection title="Jämför P/E med rätt kontext"><p>Ett P/E-tal blir mer informativt när det jämförs med bolagets historik, liknande bolag och den fundamentala utvecklingen. Om vinsten växer snabbt kan ett högre P/E vara motiverat; om kvaliteten försämras kan ett lågt P/E vara en varningssignal.</p><p>Se hur StockBox sätter värdering i ett bredare sammanhang i guiden till <Link href="/aktieanalys" className="font-semibold text-[#e1cb95] hover:text-white">aktieanalys</Link> och bland <Link href="/aktier" className="font-semibold text-[#e1cb95] hover:text-white">publika aktieanalyser</Link>.</p></SeoSection>
    </SeoArticle>
  </>;
}
