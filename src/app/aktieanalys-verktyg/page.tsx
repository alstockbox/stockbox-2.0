import type { Metadata } from "next";
import Link from "next/link";
import { SeoArticle, SeoHero, SeoJsonLd, SeoSection, breadcrumbJsonLd } from "@/components/seo/seo-shell";

export const metadata: Metadata = {
  title: "Aktieanalysverktyg – vad ska ett bra verktyg visa?",
  description: "Guide till aktieanalysverktyg: kontrollera datakällor, datum, nyckeltal, värdering, risk, saknad data, metodik och om slutsatser går att granska.",
  alternates: { canonical: "/aktieanalys-verktyg" },
};

const checks = [
  ["Rätt bolag", "Verktyget bör visa ticker, börs och bolagsidentitet så att rätt data kopplas till rätt värdepapper."],
  ["Synliga källor", "Det ska gå att förstå var finansiella fakta och marknadsobservationer kommer ifrån och vilket datum de gäller."],
  ["Reproducerbara beräkningar", "Nyckeltal bör bygga på definierade input och konsekventa formler, inte ändra innebörd mellan rapporter."],
  ["Saknad data förblir saknad", "Ett tomt eller osäkert värde är bättre än en snygg rapport som fyller luckor med antaganden utan märkning."],
  ["Flera analysdimensioner", "Värdering behöver läsas tillsammans med tillväxt, lönsamhet, finansiell hälsa, kvalitet och risk."],
  ["Tydlig aktualitet", "Rapportdatum, marknadsdatum och eventuella fördröjningar bör vara synliga så att gammal information inte ser ny ut."],
] as const;

export default function StockAnalysisToolPage() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.getstockbox.app";
  const breadcrumbs = [{ label: "StockBox", href: "/" }, { label: "Aktieanalysverktyg", href: "/aktieanalys-verktyg" }];
  const url = new URL("/aktieanalys-verktyg", baseUrl).toString();

  return <>
    <SeoJsonLd data={{ "@context": "https://schema.org", "@graph": [
      breadcrumbJsonLd(baseUrl, breadcrumbs),
      { "@type": "WebPage", "@id": `${url}#page`, url, name: "Aktieanalysverktyg", description: metadata.description, inLanguage: "sv-SE", publisher: { "@id": `${baseUrl.replace(/\/$/, "")}/#organization` }, about: { "@id": `${baseUrl.replace(/\/$/, "")}/#software` } },
    ] }} />
    <SeoHero eyebrow="Aktieanalysverktyg" title="Vad ska ett bra aktieanalysverktyg faktiskt göra?" lead="Ett analysverktyg ska inte bara producera en snygg slutsats. Det bör hjälpa dig kontrollera identitet, data, beräkningar, värdering, risk och osäkerhet — och göra det möjligt att förstå varför analysen ser ut som den gör." breadcrumbs={breadcrumbs} secondaryHref="/guider/hur-analyserar-man-en-aktie" secondaryLabel="Se analysprocessen" />
    <SeoArticle>
      <SeoSection title="Sex saker att kontrollera innan du litar på ett aktieanalysverktyg">
        <div className="grid gap-4 sm:grid-cols-2">
          {checks.map(([title, text]) => <div key={title} className="rounded-lg border border-white/10 bg-white/[0.025] p-5"><h3 className="font-semibold text-[#f4efe5]">{title}</h3><p className="mt-2 text-sm leading-6 text-[#9aa7b8]">{text}</p></div>)}
        </div>
      </SeoSection>
      <SeoSection title="AI kan hjälpa — men källkedjan måste fortfarande gå att granska"><p>AI är användbart för att strukturera stora informationsmängder och göra research mer tillgänglig. Men ett svar blir inte korrekt bara för att det är välformulerat. För finansiell analys är det särskilt viktigt att skilja mellan rapporterade fakta, deterministiskt beräknade nyckeltal, estimat och kvalitativa slutsatser.</p><p>StockBox beskriver detta närmare på sidan om <Link href="/ai-aktieanalys" className="font-semibold text-[#e1cb95] hover:text-white">AI för aktieanalys</Link>.</p></SeoSection>
      <SeoSection title="Ett score ska gå att öppna upp"><p>En enda poäng kan vara praktisk för överblick, men den bör inte vara en svart låda. StockBox visar därför score-dimensioner, konfidens och datatäckning tillsammans med analysen. Ett högt score är ett modellresultat från det tillgängliga underlaget, inte en garanti om framtida kursutveckling.</p></SeoSection>
      <SeoSection title="Nyckeltal behöver sammanhang"><p>Verktyget bör kunna visa varför <Link href="/nyckeltal/pe-tal" className="font-semibold text-[#e1cb95] hover:text-white">P/E</Link>, <Link href="/nyckeltal/ev-ebitda" className="font-semibold text-[#e1cb95] hover:text-white">EV/EBITDA</Link>, <Link href="/nyckeltal/roic" className="font-semibold text-[#e1cb95] hover:text-white">ROIC</Link> och <Link href="/nyckeltal/fritt-kassaflode" className="font-semibold text-[#e1cb95] hover:text-white">fritt kassaflöde</Link> ser ut som de gör, och när ett mått är olämpligt i stället för att alltid forcera fram en jämförelse.</p></SeoSection>
      <SeoSection title="Så skiljer StockBox sin research från ett generellt svar"><p>StockBox bygger den finansiella kärnan från strukturerad data och versionsstyrd modellogik, sparar käll- och tidskontext och visar när data saknas. Den publika SEO-ytan använder dessutom daterade snapshots i stället för att starta en ny analys varje gång en crawler öppnar sidan.</p><p>Se <Link href="/docs/methodology" className="font-semibold text-[#e1cb95] hover:text-white">metodiken</Link>, <Link href="/data-sources" className="font-semibold text-[#e1cb95] hover:text-white">datakällorna</Link> eller <Link href="/aktier" className="font-semibold text-[#e1cb95] hover:text-white">publika analyser</Link>.</p></SeoSection>
    </SeoArticle>
  </>;
}
