import type { Metadata } from "next";
import Link from "next/link";
import { SeoArticle, SeoHero, SeoJsonLd, SeoSection, breadcrumbJsonLd } from "@/components/seo/seo-shell";

export const metadata: Metadata = {
  title: "Fritt kassaflöde – vad betyder Free Cash Flow (FCF)?",
  description: "Lär dig vad fritt kassaflöde och Free Cash Flow (FCF) betyder, hur FCF används i aktieanalys och varför kassaflöde behöver jämföras med vinst och investeringar.",
  alternates: { canonical: "/nyckeltal/fritt-kassaflode" },
};

export default function FreeCashFlowPage() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.getstockbox.app";
  const breadcrumbs = [{ label: "StockBox", href: "/" }, { label: "Nyckeltal", href: "/nyckeltal" }, { label: "Fritt kassaflöde", href: "/nyckeltal/fritt-kassaflode" }];
  return <>
    <SeoJsonLd data={{ "@context": "https://schema.org", "@graph": [breadcrumbJsonLd(baseUrl, breadcrumbs), { "@type": "WebPage", name: "Fritt kassaflöde – Free Cash Flow", url: new URL("/nyckeltal/fritt-kassaflode", baseUrl).toString(), description: metadata.description, publisher: { "@id": `${baseUrl.replace(/\/$/, "")}/#organization` } }] }} />
    <SeoHero eyebrow="Kassaflöde" title="Fritt kassaflöde: vad betyder FCF och varför spelar det roll?" lead="Fritt kassaflöde visar förenklat hur mycket kassaflöde som återstår efter de investeringar som krävs i verksamheten. Det kan hjälpa investeraren att bedöma om redovisad vinst faktiskt omvandlas till pengar som kan återinvesteras, amorteras eller distribueras." breadcrumbs={breadcrumbs} secondaryHref="/nyckeltal" secondaryLabel="Alla nyckeltal" />
    <SeoArticle>
      <SeoSection title="Hur räknas fritt kassaflöde ut?"><p>En vanlig förenklad definition är <strong className="text-[#f4efe5]">operativt kassaflöde minus investeringar (capex)</strong>. Exakt beräkning kan skilja sig beroende på bolagstyp och analysändamål. Därför är det viktigt att förstå vad som faktiskt ingår i den datakälla som används.</p></SeoSection>
      <SeoSection title="Varför FCF skiljer sig från nettovinst"><p>Nettovinsten påverkas av redovisningsprinciper, periodiseringar och poster som inte är kassaflöden. Fritt kassaflöde visar en annan dimension: hur mycket kontanter verksamheten genererar efter investeringar. Ett bolag kan därför rapportera hög vinst men samtidigt ha svagt kassaflöde.</p></SeoSection>
      <SeoSection title="Vad kan göra FCF missvisande?"><p>Rörelsekapital kan skapa stora kortsiktiga svängningar. Investeringar kan också vara ovanligt låga eller höga ett enskilt år. För snabbväxande bolag kan höga investeringar vara rationella och värdeskapande, medan låga investeringar i ett moget bolag kan innebära att framtida behov skjuts framåt.</p></SeoSection>
      <SeoSection title="FCF-yield och värdering"><p>Free Cash Flow Yield relaterar fritt kassaflöde till bolagets marknadsvärde och kan användas som en värderingssignal. Men precis som <Link href="/nyckeltal/pe-tal" className="font-semibold text-[#e1cb95] hover:text-white">P/E</Link> eller <Link href="/nyckeltal/ev-ebitda" className="font-semibold text-[#e1cb95] hover:text-white">EV/EBITDA</Link> behöver den kombineras med kvalitet, tillväxt och risk. Se även <Link href="/nyckeltal/roic" className="font-semibold text-[#e1cb95] hover:text-white">ROIC</Link> för kapitalavkastning.</p></SeoSection>
    </SeoArticle>
  </>;
}
