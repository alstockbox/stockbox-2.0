import type { Metadata } from "next";
import Link from "next/link";
import { SeoArticle, SeoHero, SeoJsonLd, SeoSection, breadcrumbJsonLd } from "@/components/seo/seo-shell";

export const metadata: Metadata = {
  title: "AI aktieanalys – analysera aktier med AI och finansiell data",
  description: "AI aktieanalys med StockBox kombinerar strukturerad finansiell data, deterministiska beräkningar och researchflöden utan att hitta på saknade siffror.",
  alternates: { canonical: "/ai-aktieanalys" },
};

export default function AiStockAnalysisPage() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.getstockbox.app";
  const breadcrumbs = [{ label: "StockBox", href: "/" }, { label: "AI aktieanalys", href: "/ai-aktieanalys" }];
  return <>
    <SeoJsonLd data={{ "@context": "https://schema.org", "@graph": [breadcrumbJsonLd(baseUrl, breadcrumbs), { "@type": "WebPage", name: "AI aktieanalys", url: new URL("/ai-aktieanalys", baseUrl).toString(), description: metadata.description, publisher: { "@id": `${baseUrl.replace(/\/$/, "")}/#organization` } }] }} />
    <SeoHero eyebrow="AI aktieanalys" title="AI för aktieanalys – med kontroll på siffrorna" lead="AI kan hjälpa till att strukturera och förklara research, men finansiella nyckeltal bör inte improviseras. StockBox separerar därför beräkningar från språkbaserad research och visar vilket underlag analysen bygger på." breadcrumbs={breadcrumbs} />
    <SeoArticle>
      <SeoSection title="Vad kan AI göra i en aktieanalys?"><p>AI är användbart för att sammanföra stora informationsmängder, förklara samband och hjälpa investeraren att hitta frågor som behöver granskas. Det är däremot riskabelt att låta en språkmodell gissa finansiella siffror eller behandla saknad data som om den fanns.</p></SeoSection>
      <SeoSection title="StockBox använder deterministisk logik där siffror spelar roll"><p>Nyckeltal, poäng och värderingsberäkningar byggs från tillgängliga indata och versionsstyrd kod. Om ett centralt underlag saknas ska StockBox visa att det saknas. Det gör rapporten lättare att kontrollera och minskar risken att ett övertygande textsvar förväxlas med verifierad finansiell fakta.</p><p>Se även <Link href="/data-sources" className="font-semibold text-[#e1cb95] hover:text-white">StockBox datakällor</Link> och <Link href="/docs/methodology" className="font-semibold text-[#e1cb95] hover:text-white">metodik</Link>.</p></SeoSection>
      <SeoSection title="AI-analys är inte en prisprognos"><p>Ingen modell kan garantera hur en aktie kommer utvecklas. StockBox Score och researchvyer är analytiska sammanfattningar av tillgänglig data, inte individanpassad finansiell rådgivning eller löften om framtida avkastning.</p></SeoSection>
      <SeoSection title="Från fråga till verifierbar research"><p>Vill du analysera ett specifikt bolag kan du köra en StockBox-rapport eller börja med de <Link href="/aktier" className="font-semibold text-[#e1cb95] hover:text-white">publika aktieanalyserna</Link>. För en bredare arbetsmetod finns guiden om <Link href="/aktieanalys" className="font-semibold text-[#e1cb95] hover:text-white">aktieanalys online</Link>.</p></SeoSection>
    </SeoArticle>
  </>;
}
