import type { Metadata } from "next";
import Link from "next/link";
import { SeoArticle, SeoHero, SeoJsonLd, SeoSection, breadcrumbJsonLd } from "@/components/seo/seo-shell";

export const metadata: Metadata = {
  title: "ROIC – avkastning på investerat kapital förklarat",
  description: "Lär dig vad ROIC betyder, hur avkastning på investerat kapital används i aktieanalys och varför hög ROIC kan signalera stark kapitalallokering.",
  alternates: { canonical: "/nyckeltal/roic" },
};

export default function RoicPage() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.getstockbox.app";
  const breadcrumbs = [{ label: "StockBox", href: "/" }, { label: "Nyckeltal", href: "/nyckeltal" }, { label: "ROIC", href: "/nyckeltal/roic" }];
  return <>
    <SeoJsonLd data={{ "@context": "https://schema.org", "@graph": [breadcrumbJsonLd(baseUrl, breadcrumbs), { "@type": "WebPage", name: "ROIC – avkastning på investerat kapital", url: new URL("/nyckeltal/roic", baseUrl).toString(), description: metadata.description, publisher: { "@id": `${baseUrl.replace(/\/$/, "")}/#organization` } }] }} />
    <SeoHero eyebrow="Lönsamhet & kvalitet" title="ROIC: vad säger avkastning på investerat kapital om ett bolag?" lead="ROIC försöker mäta hur effektivt ett bolag skapar rörelseresultat efter skatt på kapitalet som krävs i verksamheten. Ett uthålligt högt ROIC kan vara ett starkt kvalitetsmått, men måste förstås tillsammans med tillväxt, konkurrensläge och redovisning." breadcrumbs={breadcrumbs} secondaryHref="/nyckeltal" secondaryLabel="Alla nyckeltal" />
    <SeoArticle>
      <SeoSection title="Vad är ROIC?"><p>ROIC står för Return on Invested Capital. En vanlig princip är att jämföra rörelseresultat efter skatt med det kapital som är investerat i den operativa verksamheten. Exakt definition kan variera mellan datakällor och analysmodeller, så StockBox försöker bevara metodik och proveniens i stället för att behandla alla ROIC-värden som identiska.</p></SeoSection>
      <SeoSection title="Varför hög ROIC kan vara viktigt"><p>Ett bolag som kan återinvestera stora mängder kapital till hög avkastning kan skapa betydande värde över lång tid. Kombinationen av hög ROIC och lång återinvesteringsbana är ofta mer intressant än hög ROIC i ett bolag som saknar möjlighet att växa.</p></SeoSection>
      <SeoSection title="När ROIC behöver granskas extra"><p>Förvärv, goodwill, stora engångsposter, leasing, finansiella verksamheter och immateriella investeringar kan göra jämförelser svårare. Ett enskilt års höga ROIC bör därför inte automatiskt ses som bevis för bestående kvalitet.</p></SeoSection>
      <SeoSection title="Koppla ROIC till värdering och kassaflöde"><p>Hög kapitalavkastning är mest användbar när den sätts mot vad marknaden betalar för bolaget och hur vinsten omvandlas till kassaflöde. Läs om <Link href="/nyckeltal/fritt-kassaflode" className="font-semibold text-[#e1cb95] hover:text-white">fritt kassaflöde</Link>, <Link href="/nyckeltal/ev-ebitda" className="font-semibold text-[#e1cb95] hover:text-white">EV/EBITDA</Link> och hur StockBox bygger en <Link href="/fundamental-analys" className="font-semibold text-[#e1cb95] hover:text-white">fundamental analys</Link>.</p></SeoSection>
    </SeoArticle>
  </>;
}
