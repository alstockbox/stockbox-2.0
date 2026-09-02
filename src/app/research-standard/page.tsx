import type { Metadata } from "next";
import Link from "next/link";
import { SeoArticle, SeoHero, SeoJsonLd, SeoSection, breadcrumbJsonLd } from "@/components/seo/seo-shell";
import { MODEL_VERSION } from "@/lib/analysis/config";

export const metadata: Metadata = {
  title: "StockBox Research Standard – källor, publicering och korrigeringar",
  description: "Så styr StockBox publicering av analyser, datatäckning, konfidens, modellversioner, saknad data, källor och korrigeringar i publik aktieresearch.",
  alternates: { canonical: "/research-standard" },
};

export default function ResearchStandardPage() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.getstockbox.app";
  const url = new URL("/research-standard", baseUrl).toString();
  const breadcrumbs = [
    { label: "StockBox", href: "/" },
    { label: "Research Standard", href: "/research-standard" },
  ];

  return <>
    <SeoJsonLd data={{ "@context": "https://schema.org", "@graph": [
      breadcrumbJsonLd(baseUrl, breadcrumbs),
      {
        "@type": ["TechArticle", "WebPage"],
        "@id": `${url}#standard`,
        url,
        headline: "StockBox Research Standard",
        description: metadata.description,
        inLanguage: "sv-SE",
        version: MODEL_VERSION,
        softwareVersion: MODEL_VERSION,
        publisher: { "@id": `${baseUrl.replace(/\/$/, "")}/#organization` },
        author: { "@id": `${baseUrl.replace(/\/$/, "")}/#organization` },
        isPartOf: { "@id": `${baseUrl.replace(/\/$/, "")}/#website` },
        about: ["equity research", "financial data quality", "research methodology", "corrections policy"],
      },
    ] }} />
    <SeoHero
      eyebrow="Research Standard"
      title="Så sätter StockBox gränser för publik aktieresearch"
      lead="En analys är bara användbar om det går att förstå var siffrorna kommer från, vilket datum de gäller, vad modellen faktiskt kan bedöma och när underlaget är för svagt. Den här standarden beskriver den publika researchgränsen i StockBox."
      breadcrumbs={breadcrumbs}
      secondaryHref="/docs/methodology"
      secondaryLabel="Läs metodiken"
    />
    <SeoArticle>
      <SeoSection title="Publiceringsstandard">
        <p>En användaranalys blir inte automatiskt en publik StockBox-sida. Publicering kräver en separat administrativ handling och den publika snapshoten måste passera definierade kvalitetsgrindar. För den nuvarande publiceringsmodellen krävs balanced research-profil, aktuell datastatus, ett tillgängligt StockBox Score, minst 70&nbsp;% datatäckning, minst 65&nbsp;% konfidens och verifierbar bolagsidentitet. Om villkoren inte är uppfyllda ska sidan inte publiceras som indexerbar bolagsanalys.</p>
      </SeoSection>
      <SeoSection title="Datatäckning är inte samma sak som säkerhet">
        <p><strong>Datatäckning</strong> beskriver hur mycket av det relevanta analysunderlaget som faktiskt finns tillgängligt. Hög täckning betyder inte att framtiden är förutsägbar; den betyder att modellen har mer av det underlag den är konstruerad för att använda. Saknad data ska förbli saknad data i stället för att ersättas med uppskattningar bara för att fylla en rapport.</p>
      </SeoSection>
      <SeoSection title="Konfidens är inte en sannolikhet för avkastning">
        <p><strong>Konfidens</strong> används som en forskningskvalitetssignal kring datatäckning, kompatibilitet, konflikter och modellbegränsningar. En konfidens på exempelvis 80&nbsp;% betyder inte 80&nbsp;% sannolikhet att aktien stiger eller att en värdering blir korrekt.</p>
      </SeoSection>
      <SeoSection title="Modellversion och reproducerbarhet">
        <p>Nuvarande <strong>Modellversion</strong> är <strong>{MODEL_VERSION}</strong>. Förändringar i scoring, datalogik eller analysregler ska versionsidentifieras och testas innan de används i produktion. En publik snapshot behåller analysens modell- och datakontext så att ett senare resultat inte ska presenteras som om det vore samma körning.</p>
      </SeoSection>
      <SeoSection title="Källor, konflikter och saknad data">
        <p>StockBox skiljer mellan källfakta, beräkningar och modellens sammanvägning. Källkonflikter kan sänka täckning eller konfidens och kan blockera ett mått när enheter, valutor, perioder eller definitioner inte kan förenas. StockBox ersätter inte okänd fundamental data med noll. Läs den detaljerade <Link href="/data-sources" className="font-semibold text-[#e1cb95] hover:text-white">käll- och datakvalitetsbeskrivningen</Link>.</p>
      </SeoSection>
      <SeoSection title="Arketyp före standardmall">
        <p>Banker, försäkringsbolag, REITs, investment-/holdingbolag och andra specialfall ska inte tvingas genom exakt samma ekonomiska modell som ett vanligt rörelsebolag. När en lämplig värderingsram eller nödvändiga specialdata saknas kan StockBox avstå från en full bedömning i stället för att skapa skenprecision. Den versionsstyrda logiken beskrivs vidare i <Link href="/docs/methodology" className="font-semibold text-[#e1cb95] hover:text-white">StockBox metodik</Link>.</p>
      </SeoSection>
      <SeoSection title="Publika snapshots är daterade – inte liveflöden">
        <p>En publik bolagssida är en daterad snapshot av en kvalificerad analys. Den visar analysdatum, källor, datatäckning och konfidens när uppgifterna finns. Marknadspris, rapportdata och bolagsförhållanden kan förändras efter snapshotens datum. En ny analys ska därför inte beskrivas som en retroaktiv ändring av den gamla marknadssituationen.</p>
      </SeoSection>
      <SeoSection title="Korrigeringar och ompublicering">
        <p><strong>Korrigeringar</strong> ska bygga på bättre eller rättat underlag, inte på att en tidigare marknadsrörelse blev obekväm. När en ny kvalificerad analys publiceras för samma ticker behåller StockBox den etablerade canonical-URL:en och det ursprungliga publiceringsdatumet, samtidigt som uppdateringstid och den nya snapshotens data kan förändras. Misstänkta datafel, felaktig bolagsidentitet eller källproblem kan rapporteras via <Link href="/contact" className="font-semibold text-[#e1cb95] hover:text-white">StockBox kontaktväg</Link>.</p>
      </SeoSection>
      <SeoSection title="Vad standarden inte lovar">
        <p>StockBox Research Standard är ett kvalitets- och transparensramverk. Den är inte en garanti för framtida avkastning, fullständig datatillgänglighet eller att varje bolag kan värderas med samma precision. StockBox ger inte individanpassad finansiell rådgivning och en modellscore ersätter inte användarens egen riskbedömning.</p>
      </SeoSection>
    </SeoArticle>
  </>;
}
