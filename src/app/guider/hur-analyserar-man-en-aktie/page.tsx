import type { Metadata } from "next";
import Link from "next/link";
import { SeoArticle, SeoHero, SeoJsonLd, SeoSection, breadcrumbJsonLd } from "@/components/seo/seo-shell";

export const metadata: Metadata = {
  title: "Hur analyserar man en aktie? Steg-för-steg guide",
  description: "Lär dig analysera en aktie steg för steg: bolag, tillväxt, lönsamhet, kassaflöde, balansräkning, värdering, risker och källkritik.",
  alternates: { canonical: "/guider/hur-analyserar-man-en-aktie" },
};

export default function HowToAnalyzeStockPage() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.getstockbox.app";
  const breadcrumbs = [
    { label: "StockBox", href: "/" },
    { label: "Guider", href: "/guider" },
    { label: "Hur analyserar man en aktie?", href: "/guider/hur-analyserar-man-en-aktie" },
  ];
  const url = new URL("/guider/hur-analyserar-man-en-aktie", baseUrl).toString();
  return <>
    <SeoJsonLd data={{ "@context": "https://schema.org", "@graph": [
      breadcrumbJsonLd(baseUrl, breadcrumbs),
      { "@type": "TechArticle", "@id": `${url}#guide`, url, headline: "Hur analyserar man en aktie?", description: metadata.description, inLanguage: "sv-SE", publisher: { "@id": `${baseUrl.replace(/\/$/, "")}/#organization` }, author: { "@id": `${baseUrl.replace(/\/$/, "")}/#organization` } },
    ] }} />
    <SeoHero eyebrow="Aktieanalys steg för steg" title="Hur analyserar man en aktie?" lead="En bra aktieanalys går från fakta till tolkning i en bestämd ordning. Börja med att säkerställa vilket bolag och vilken period du analyserar, bygg sedan bilden av verksamheten och avsluta med värdering, risk och vad som skulle kunna ändra slutsatsen." breadcrumbs={breadcrumbs} secondaryHref="/aktieanalys-verktyg" secondaryLabel="Välj analysverktyg" />
    <SeoArticle>
      <SeoSection title="1. Säkerställ rätt bolag och rätt data"><p>Kontrollera ticker, börs, valuta, rapportperiod och vilket värdepapper du faktiskt tittar på. Fel aktieslag, olika valutor eller blandade perioder kan göra resten av analysen missvisande även om varje enskild siffra ser rimlig ut.</p></SeoSection>
      <SeoSection title="2. Förstå hur bolaget tjänar pengar"><p>Identifiera produkter eller tjänster, viktiga kundgrupper, geografier och kostnadsdrivare. Fråga vad som driver omsättning och marginaler, hur konjunkturkänslig verksamheten är och vilka faktorer som kan förändra konkurrensläget.</p></SeoSection>
      <SeoSection title="3. Granska tillväxtens kvalitet"><p>Jämför omsättning, vinst och fritt kassaflöde över flera perioder. Tillväxt är mer övertygande när den är återkommande, inte kräver orimligt mycket nytt kapital och inte köps genom snabbt försämrade marginaler eller utspädning.</p></SeoSection>
      <SeoSection title="4. Mät lönsamhet och kapitalavkastning"><p>Rörelse- och nettomarginal visar hur mycket av intäkterna som blir resultat. Kapitalmått som <Link href="/nyckeltal/roic" className="font-semibold text-[#e1cb95] hover:text-white">ROIC</Link> hjälper till att bedöma hur effektivt bolaget använder det kapital verksamheten kräver.</p></SeoSection>
      <SeoSection title="5. Kontrollera kassaflöde och balansräkning"><p>Redovisad vinst och verkligt kassaflöde är inte samma sak. Jämför därför resultat med operativt och <Link href="/nyckeltal/fritt-kassaflode" className="font-semibold text-[#e1cb95] hover:text-white">fritt kassaflöde</Link>. Titta samtidigt på skuld, likviditet och räntetäckning för att förstå hur mycket finansiell motståndskraft bolaget har.</p></SeoSection>
      <SeoSection title="6. Värdera bolaget i rätt kontext"><p>Multiplar som <Link href="/nyckeltal/pe-tal" className="font-semibold text-[#e1cb95] hover:text-white">P/E</Link> och <Link href="/nyckeltal/ev-ebitda" className="font-semibold text-[#e1cb95] hover:text-white">EV/EBITDA</Link> behöver sättas i relation till tillväxt, kvalitet, skuld, historik och jämförbara bolag. Ett lågt tal är inte automatiskt billigt och ett högt tal är inte automatiskt dyrt.</p></SeoSection>
      <SeoSection title="7. Skriv ner risker, triggers och vad som kan ändra tesen"><p>En analys blir mer användbar om du på förhand definierar vilka observationer som stärker eller försvagar den. Det kan vara marginalutveckling, orderingång, skuldsättning, en kommande rapport eller att värderingen rör sig långt från det scenario du analyserade.</p></SeoSection>
      <SeoSection title="8. Dokumentera källorna"><p>Spara var siffrorna kommer ifrån och vilket datum de gäller. StockBox visar därför <Link href="/data-sources" className="font-semibold text-[#e1cb95] hover:text-white">datakällor</Link>, täckning och konfidens tillsammans med analysen. Saknad data bör vara synlig, inte ersättas med ett påhittat värde.</p><p>Vill du göra processen i ett verktyg kan du börja på <Link href="/aktieanalys" className="font-semibold text-[#e1cb95] hover:text-white">StockBox aktieanalys</Link>.</p></SeoSection>
    </SeoArticle>
  </>;
}
