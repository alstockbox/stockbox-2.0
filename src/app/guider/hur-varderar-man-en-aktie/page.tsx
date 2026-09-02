import type { Metadata } from "next";
import Link from "next/link";
import { SeoArticle, SeoHero, SeoJsonLd, SeoSection, breadcrumbJsonLd } from "@/components/seo/seo-shell";

export const metadata: Metadata = {
  title: "Hur värderar man en aktie? Multiplar, kassaflöde och risk",
  description: "Lär dig värdera en aktie med P/E, EV/EBITDA, fritt kassaflöde, tillväxt, kvalitet och scenarier utan att förlita dig på ett enda nyckeltal.",
  alternates: { canonical: "/guider/hur-varderar-man-en-aktie" },
};

export default function HowToValueStockPage() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.getstockbox.app";
  const breadcrumbs = [
    { label: "StockBox", href: "/" },
    { label: "Guider", href: "/guider" },
    { label: "Hur värderar man en aktie?", href: "/guider/hur-varderar-man-en-aktie" },
  ];
  const url = new URL("/guider/hur-varderar-man-en-aktie", baseUrl).toString();

  return <>
    <SeoJsonLd data={{ "@context": "https://schema.org", "@graph": [
      breadcrumbJsonLd(baseUrl, breadcrumbs),
      { "@type": "TechArticle", "@id": `${url}#guide`, url, headline: "Hur värderar man en aktie?", description: metadata.description, inLanguage: "sv-SE", publisher: { "@id": `${baseUrl.replace(/\/$/, "")}/#organization` }, author: { "@id": `${baseUrl.replace(/\/$/, "")}/#organization` } },
    ] }} />
    <SeoHero eyebrow="Aktievärdering" title="Hur värderar man en aktie?" lead="Aktievärdering handlar om relationen mellan priset du betalar och den ekonomi bolaget kan skapa. Det finns ingen multipel som ensam ger ett rättvist värde: metod, kvalitet, tillväxt, skuld, cyklikalitet och osäkerhet behöver vägas tillsammans." breadcrumbs={breadcrumbs} secondaryHref="/nyckeltal" secondaryLabel="Se nyckeltalsguider" />
    <SeoArticle>
      <SeoSection title="Börja med vad som faktiskt ska värderas"><p>Aktiekursen är priset per aktie, medan enterprise value försöker beskriva värdet på den operativa verksamheten efter hänsyn till nettoskuld och vissa andra kapitalposter. Därför passar olika multiplar för olika frågor. P/E relaterar priset på eget kapital till vinst per aktie, medan EV/EBITDA jämför verksamhetsvärdet med ett resultatmått före ränta, skatt och avskrivningar.</p></SeoSection>
      <SeoSection title="Relativ värdering med multiplar"><p><Link href="/nyckeltal/pe-tal" className="font-semibold text-[#e1cb95] hover:text-white">P/E</Link> är enkelt och användbart när vinsten är positiv och någorlunda representativ. <Link href="/nyckeltal/ev-ebitda" className="font-semibold text-[#e1cb95] hover:text-white">EV/EBITDA</Link> kan underlätta jämförelser mellan bolag med olika kapitalstruktur. Men jämförelsen blir svag om bolagen har olika tillväxt, marginaler, kapitalbehov eller redovisningsprofil.</p></SeoSection>
      <SeoSection title="Värdera kassaflödet, inte bara redovisad vinst"><p><Link href="/nyckeltal/fritt-kassaflode" className="font-semibold text-[#e1cb95] hover:text-white">Fritt kassaflöde</Link> visar hur mycket kassaflöde som återstår efter investeringar enligt den definition som används. Det kan ge en annan bild än P/E när redovisad vinst och kassagenerering skiljer sig mycket.</p></SeoSection>
      <SeoSection title="Tillväxt påverkar vad en multipel betyder"><p>Ett bolag som kan återinvestera kapital till hög avkastning och växa länge kan rationellt handlas till högre multiplar än ett bolag med svag eller fallande ekonomi. Därför bör värderingen alltid läsas tillsammans med omsättnings- och vinstutveckling, marginaler och <Link href="/nyckeltal/roic" className="font-semibold text-[#e1cb95] hover:text-white">ROIC</Link>.</p></SeoSection>
      <SeoSection title="Använd flera scenarier"><p>I stället för ett exakt målvärde kan du bygga ett bear-, base- och bull-scenario med tydliga antaganden för tillväxt, marginal, kapitalbehov och avkastningskrav. Ju känsligare värdet är för små ändringar i antagandena, desto mindre bör du behandla ett enskilt punktvärde som exakt.</p></SeoSection>
      <SeoSection title="Kontrollera enheterna före slutsatsen"><p>Valuta, antal aktier, rapportperiod och skillnaden mellan marknadsvärde och enterprise value kan skapa stora fel. StockBox försöker därför blockera eller markera värdering när centrala input inte kan verifieras, i stället för att forcera fram ett tal.</p></SeoSection>
      <SeoSection title="Värdering är en del av analysen"><p>Ett attraktivt pris kan inte helt kompensera för okända risker, och ett fantastiskt bolag kan fortfarande vara svårt att motivera vid extrem värdering. Koppla därför värderingen till hela processen i guiden <Link href="/guider/hur-analyserar-man-en-aktie" className="font-semibold text-[#e1cb95] hover:text-white">hur analyserar man en aktie?</Link> eller se <Link href="/aktier" className="font-semibold text-[#e1cb95] hover:text-white">publika StockBox-snapshots</Link>.</p></SeoSection>
    </SeoArticle>
  </>;
}
