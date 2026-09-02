import type { Metadata } from "next";
import Link from "next/link";
import { SeoArticle, SeoHero, SeoJsonLd, SeoSection, breadcrumbJsonLd } from "@/components/seo/seo-shell";

export const metadata: Metadata = {
  title: "EV/EBITDA – vad betyder det och hur tolkar man multipeln?",
  description: "Lär dig vad EV/EBITDA betyder, hur måttet räknas och när det är mer användbart än P/E. StockBox guide till EV/EBITDA i aktieanalys.",
  alternates: { canonical: "/nyckeltal/ev-ebitda" },
};

export default function EvEbitdaPage() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.getstockbox.app";
  const breadcrumbs = [{ label: "StockBox", href: "/" }, { label: "Nyckeltal", href: "/nyckeltal" }, { label: "EV/EBITDA", href: "/nyckeltal/ev-ebitda" }];
  return <>
    <SeoJsonLd data={{ "@context": "https://schema.org", "@graph": [breadcrumbJsonLd(baseUrl, breadcrumbs), { "@type": "WebPage", name: "EV/EBITDA", url: new URL("/nyckeltal/ev-ebitda", baseUrl).toString(), description: metadata.description, publisher: { "@id": `${baseUrl.replace(/\/$/, "")}/#organization` } }] }} />
    <SeoHero eyebrow="Värdering" title="EV/EBITDA: vad betyder multipeln och när är den användbar?" lead="EV/EBITDA jämför verksamhetens rörelsevärde med EBITDA. Eftersom enterprise value inkluderar nettoskuld ger måttet en annan bild än P/E och kan vara användbart när två bolag har olika kapitalstruktur." breadcrumbs={breadcrumbs} secondaryHref="/nyckeltal" secondaryLabel="Alla nyckeltal" />
    <SeoArticle>
      <SeoSection title="Hur räknas EV/EBITDA ut?"><p><strong className="text-[#f4efe5]">EV/EBITDA = Enterprise Value / EBITDA.</strong> Enterprise Value utgår förenklat från börsvärdet och justerar för nettoskuld och vissa andra finansieringsposter. EBITDA är resultat före räntor, skatt samt av- och nedskrivningar.</p></SeoSection>
      <SeoSection title="Varför EV/EBITDA skiljer sig från P/E"><p>P/E bygger på nettovinsten efter finansiering och skatt. EV/EBITDA ligger högre upp i resultaträkningen och enterprise value tar hänsyn till kapitalstrukturen. Två bolag med samma börsvärde men helt olika nettoskuld kan därför se betydligt mer olika ut på EV/EBITDA än på enklare equity-multiplar.</p></SeoSection>
      <SeoSection title="När kan EV/EBITDA missleda?"><p>EBITDA ignorerar investeringar i materiella och immateriella tillgångar. För kapitalintensiva verksamheter kan därför ett lågt EV/EBITDA se attraktivt ut trots att stora investeringar krävs för att upprätthålla verksamheten. Måttet bör då kompletteras med fritt kassaflöde, avkastning på kapital och balansräkning.</p></SeoSection>
      <SeoSection title="Så använder StockBox EV/EBITDA"><p>StockBox behandlar EV/EBITDA som en del av värderingsbilden, inte som ett självständigt köp- eller säljkriterium. Jämför med <Link href="/nyckeltal/pe-tal" className="font-semibold text-[#e1cb95] hover:text-white">P/E-tal</Link>, <Link href="/nyckeltal/fritt-kassaflode" className="font-semibold text-[#e1cb95] hover:text-white">fritt kassaflöde</Link> och <Link href="/aktier" className="font-semibold text-[#e1cb95] hover:text-white">publika bolagsanalyser</Link>.</p></SeoSection>
    </SeoArticle>
  </>;
}
