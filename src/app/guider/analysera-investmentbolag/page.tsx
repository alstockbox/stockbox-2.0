import type { Metadata } from "next";
import Link from "next/link";
import { SeoArticle, SeoHero, SeoJsonLd, SeoSection, breadcrumbJsonLd } from "@/components/seo/seo-shell";

export const metadata: Metadata = {
  title: "Analysera investmentbolag – substansvärde, rabatt och NAV",
  description: "Lär dig analysera investmentbolag med substansvärde (NAV), substansrabatt eller premie, NAV-tillväxt, skuldsättning, portföljkvalitet och riskspridning.",
  alternates: { canonical: "/guider/analysera-investmentbolag" },
};

export default function AnalyzeInvestmentCompaniesPage() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.getstockbox.app";
  const breadcrumbs = [
    { label: "StockBox", href: "/" },
    { label: "Guider", href: "/guider" },
    { label: "Analysera investmentbolag", href: "/guider/analysera-investmentbolag" },
  ];
  const url = new URL("/guider/analysera-investmentbolag", baseUrl).toString();

  return <>
    <SeoJsonLd data={{ "@context": "https://schema.org", "@graph": [
      breadcrumbJsonLd(baseUrl, breadcrumbs),
      {
        "@type": "TechArticle",
        "@id": `${url}#guide`,
        url,
        headline: "Analysera investmentbolag",
        description: metadata.description,
        inLanguage: "sv-SE",
        publisher: { "@id": `${baseUrl.replace(/\/$/, "")}/#organization` },
        author: { "@id": `${baseUrl.replace(/\/$/, "")}/#organization` },
        about: ["investmentbolag", "substansvärde", "NAV", "substansrabatt", "substanspremie"],
      },
    ] }} />
    <SeoHero
      eyebrow="Investmentbolagsanalys"
      title="Analysera investmentbolag med substansvärde, NAV och rätt kontext"
      lead="Investmentbolag bör inte bedömas som vanliga rörelsebolag. Portföljvärden, skulder, substansvärde per aktie, rabatt eller premie och kapitalallokering är ofta viktigare än ett ensamt P/E-tal."
      breadcrumbs={breadcrumbs}
      secondaryHref="/guider/hur-varderar-man-en-aktie"
      secondaryLabel="Guide till aktievärdering"
    />
    <SeoArticle>
      <SeoSection title="Analysera investmentbolag annorlunda än rörelsebolag">
        <p>Ett vanligt industribolag skapar huvuddelen av sitt värde genom den egna operativa verksamheten. Ett investmentbolag äger i stället en portfölj av noterade och ibland onoterade tillgångar. Därför behöver analysen börja i värdet och kvaliteten på innehaven, finansieringen och hur ledningen allokerar kapital. Ett vanligt P/E kan ge kompletterande information men är sällan den viktigaste värderingsankaret.</p>
      </SeoSection>
      <SeoSection title="Börja med substansvärde – NAV">
        <p>Substansvärde, ofta kallat NAV (Net Asset Value), försöker beskriva värdet på bolagets tillgångar efter avdrag för relevanta skulder och andra nettoskuldspositioner. För en aktieägare är substansvärde per aktie särskilt användbart eftersom det kan jämföras med aktiekursen och följas över tid. Kontrollera alltid vilket datum NAV gäller och hur onoterade innehav har värderats.</p>
      </SeoSection>
      <SeoSection title="Substansrabatt och substanspremie">
        <p>När aktien handlas under substansvärdet talar man om substansrabatt. Handlas den över NAV är det en substanspremie. En stor substansrabatt betyder inte automatiskt att aktien är billig: marknaden kan diskontera hög skuldsättning, koncentrationsrisk, förvaltningskostnader, svag kapitalallokering eller osäkra värden i onoterade innehav. På samma sätt kan en premie spegla ett starkt historiskt kapitalallokeringsresultat eller särskilt attraktiva tillgångar.</p>
      </SeoSection>
      <SeoSection title="Följ NAV per aktie, inte bara dagens rabatt">
        <p>En ögonblicksbild av rabatten säger mindre än hur substansvärdet per aktie utvecklas över flera år. Studera NAV-tillväxt per aktie, utdelningar, nyemissioner och eventuell utspädning tillsammans. Ett investmentbolag som konsekvent ökar substansvärdet per aktie med rimlig risk har en annan ekonomisk profil än ett bolag där rabatten ser hög ut men NAV stagnerar.</p>
      </SeoSection>
      <SeoSection title="Skuldsättning kan förstärka både upp- och nedgång">
        <p>Investmentbolag använder ibland skuld på moderbolagsnivå. Nettoskuld i relation till eget kapital, likviditet, räntor och förfallostruktur påverkar hur robust portföljen är i en nedgång. En rabatt bör därför aldrig analyseras frikopplad från balansräkningen.</p>
      </SeoSection>
      <SeoSection title="Noterade och onoterade innehav kräver olika säkerhetsmarginal">
        <p>Noterade innehav har ett observerbart marknadspris, medan onoterade innehav kräver värderingsantaganden. Ju större andel onoterat och ju osäkrare värderingsmetoden är, desto viktigare blir transparens, senaste transaktionsdata och en rimlig säkerhetsmarginal. Koncentration spelar också roll: ett fåtal stora innehav kan dominera hela investmentbolagets risk.</p>
      </SeoSection>
      <SeoSection title="Varför P/E inte räcker för investmentbolag">
        <p>P/E relaterar aktiekursen till redovisad vinst. För investmentbolag kan resultatet påverkas kraftigt av värdeförändringar i innehav och andra poster som inte beskriver den underliggande portföljens långsiktiga värdeskapande särskilt väl. Läs därför P/E som sekundär kontext och låt substansvärde, NAV-utveckling, skuld och portföljkvalitet bära större del av analysen.</p>
      </SeoSection>
      <SeoSection title="Så behandlar StockBox holding companies">
        <p>StockBox har en separat holding-company-modell i analysmotorn. För den typen av bolag används <strong>NAV / SOTP</strong> som värderingsram, med bland annat NAV-rabatt eller premie och NAV per aktie som centrala signaler. Om tillräckligt verifierbart NAV/SOTP-underlag saknas ska modellen inte forcera fram ett vanligt bolagsbetyg utan kan landa i <strong>No Rating</strong>. Det är avsiktligt: saknad investmentbolagsdata ska inte ersättas med rörelsebolagsmått som ser precisa ut men svarar på fel fråga.</p>
      </SeoSection>
      <SeoSection title="Checklista för investmentbolagsanalys">
        <ul className="list-disc space-y-2 pl-5">
          <li>Vilket substansvärde per aktie gäller, och vilket datum är det beräknat för?</li>
          <li>Handlas aktien med substansrabatt eller substanspremie, och hur ser den ut historiskt?</li>
          <li>Hur har NAV per aktie utvecklats över flera år?</li>
          <li>Hur stor är nettoskulden och hur känslig är finansieringen?</li>
          <li>Hur koncentrerad är portföljen och hur stor andel är onoterad?</li>
          <li>Hur värderas onoterade innehav och hur färska är underlagen?</li>
          <li>Hur ser förvaltningskostnader, utdelningar och eventuell utspädning ut?</li>
          <li>Finns verifierbara källor för de datapunkter som driver slutsatsen?</li>
        </ul>
      </SeoSection>
      <SeoSection title="Fortsätt med verifierbar metodik">
        <p>Läs <Link href="/docs/methodology" className="font-semibold text-[#e1cb95] hover:text-white">StockBox metodik</Link> för hur analysmotorn hanterar datatäckning, modeller och saknade datapunkter. Du kan också se <Link href="/aktier" className="font-semibold text-[#e1cb95] hover:text-white">publika StockBox-analyser</Link> för daterade exempel där publiceringskraven är uppfyllda.</p>
      </SeoSection>
    </SeoArticle>
  </>;
}
