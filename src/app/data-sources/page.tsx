import type { Metadata } from "next";
import { Card, Container, Section } from "@/components/ui/card";
import { getLocale } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Data Sources",
  description: "How StockBox sources, reconciles and labels filings, market observations, official registers and missing data.",
  alternates: { canonical: "/data-sources" },
};

const sources = [
  { title: "SEC EDGAR", text: "Primary filing facts are used for supported SEC issuers. Deep research can also use official Form 4 ownership filings when a verified issuer CIK is available.", url: "https://www.sec.gov/edgar/sec-api-documentation" },
  { title: "Bolagsverket — Värdefulla datamängder", text: "For matched Swedish legal entities, StockBox can verify metadata for digitally filed annual reports. Bolagsverket access is additive and requires the environment credentials supplied for its free valuable-datasets API.", url: "https://bolagsverket.se/apierochoppnadata/hamtaforetagsinformation/vardefulladatamangder/apiforvardefulladatamangder.5513.html" },
  { title: "Finansinspektionen — Insynsregistret", text: "Swedish deep research can use FI's official insider register for matched issuer transactions. No transaction is treated as positive or negative merely because other activity is absent.", url: "https://www.fi.se/sv/vara-register/insynsregistret/" },
  { title: "Finansinspektionen — Blankningsregistret", text: "Aggregate reported Swedish short positions are matched by LEI where available. A missing register row is not interpreted as zero short interest.", url: "https://www.fi.se/sv/vara-register/blankningsregistret/" },
  { title: "GLEIF", text: "Legal Entity Identifier reference data strengthens issuer identity and can provide registration-authority identifiers used for Swedish official-source matching.", url: "https://www.gleif.org/en/lei-data/gleif-api" },
  { title: "OpenFIGI", text: "Instrument mapping strengthens FIGI/ISIN/ticker identity. StockBox rejects ambiguous mappings instead of silently selecting a weak candidate.", url: "https://www.openfigi.com/api" },
  { title: "Sveriges Riksbank — SWEA", text: "Official government-bond observations provide macro and risk-free-rate context. Observations are timestamped and cached to respect public API limits.", url: "https://www.riksbank.se/en-gb/statistics/interest-rates-and-exchange-rates/retrieving-interest-rates-and-exchange-rates-via-api/" },
  { title: "Yahoo Finance fundamentals", text: "A broad secondary fundamentals source used to extend compatible global coverage where primary filing facts are unavailable. Production use must follow the applicable provider/data licensing terms.", url: "https://finance.yahoo.com/" },
  { title: "Configured market-data providers", text: "Price history and other market observations retain provider identity and timestamps. StockBox operators must use a plan/license that permits the intended commercial end-user display.", url: null },
  { title: "StockBox calculations", text: "Ratios, normalized metrics, scoring, valuation, conflict handling and research coverage are calculated in versioned application code from the available inputs. Missing data is never manufactured to fill a gap.", url: null },
] as const;

export default async function DataSourcesPage() {
  const locale = await getLocale();
  const sv = locale === "sv";
  return <Section><Container className="max-w-5xl">
    <p className="text-sm font-semibold text-[#e1cb95]">{sv ? "Datakällor" : "Data sources"}</p>
    <h1 className="serif mt-2 text-4xl font-semibold">{sv ? "Varifrån StockBox får sina siffror och research-signaler" : "Where StockBox gets its financial data and research signals"}</h1>
    <p className="mt-5 max-w-3xl text-base leading-7 text-[#c9d2df]">{sv ? "StockBox kombinerar källor efter identitet, tillgänglighet och kompatibilitet. Varje officiell research-signal behåller källa och datum. En datapunkt märks inte som filing- eller registerdata om den inte faktiskt kommer från den källan." : "StockBox combines sources based on identity, availability and compatibility. Official research signals retain their source and date. A data point is not described as filing or register data unless it actually came from that source."}</p>
    <div className="mt-10 grid gap-4 md:grid-cols-2">
      {sources.map((source) => <Card key={source.title}><h2 className="font-semibold text-[#f4efe5]">{source.title}</h2><p className="mt-2 text-sm leading-6 text-[#9aa7b8]">{source.text}</p>{source.url ? <a className="mt-3 inline-block text-xs font-semibold text-[#e1cb95] underline underline-offset-4" href={source.url} target="_blank" rel="noreferrer">{sv ? "Officiell källa" : "Official source"}</a> : null}</Card>)}
    </div>
    <div className="mt-10 space-y-5 text-sm leading-7 text-[#c9d2df]">
      <section><h2 className="text-lg font-semibold text-[#f4efe5]">{sv ? "Källhierarki och konflikter" : "Source hierarchy and conflicts"}</h2><p className="mt-2">{sv ? "När kompatibla källor skiljer sig bevaras konflikten och kan sänka täckning, konfidens eller blockera ett mått. Officiella register används inte för att skriva över fundamentala siffror som de inte rapporterar. StockBox ersätter inte okänd data med noll." : "When compatible sources disagree, the conflict is preserved and can reduce coverage, confidence or block a metric. Official registers do not overwrite fundamental figures they do not report. StockBox does not replace unknown data with zero."}</p></section>
      <section><h2 className="text-lg font-semibold text-[#f4efe5]">{sv ? "Identitet före data" : "Identity before data"}</h2><p className="mt-2">{sv ? "CIK, LEI, FIGI, ISIN, börs och ticker används där de finns för att minska risken att rätt datapunkt kopplas till fel bolag eller värdepapper. Osäkra GLEIF/OpenFIGI-träffar avvisas." : "CIK, LEI, FIGI, ISIN, exchange and ticker are used where available to reduce the risk of attaching correct data to the wrong issuer or security. Weak GLEIF/OpenFIGI matches are rejected."}</p></section>
      <section><h2 className="text-lg font-semibold text-[#f4efe5]">{sv ? "Valutor och perioder" : "Currencies and periods"}</h2><p className="mt-2">{sv ? "Värdering kräver kompatibla enheter, perioder och valutor. Om de inte kan verifieras markeras värderingen som otillgänglig i stället för att tvingas fram." : "Valuation requires compatible units, periods and currencies. If they cannot be verified, valuation is marked unavailable rather than forced."}</p></section>
      <section><h2 className="text-lg font-semibold text-[#f4efe5]">{sv ? "Uppdateringsfrekvens" : "Freshness"}</h2><p className="mt-2">{sv ? "Rapporter visar rapport-, register- och marknadsdatum när källan tillhandahåller dem. Providerdata kan vara fördröjd, EOD-baserad eller ofullständig beroende på marknad och datapunkt." : "Reports expose filing, register and market observation dates when the source provides them. Provider data may be delayed, end-of-day or incomplete depending on the market and data point."}</p></section>
      <section><h2 className="text-lg font-semibold text-[#f4efe5]">{sv ? "Viktiga begränsningar" : "Important limitations"}</h2><p className="mt-2">{sv ? "Bolagsverket omfattar digitalt inlämnade årsredovisningar, inte automatiskt varje historisk svensk årsredovisning. FI:s blankningssumma följer FI:s rapporteringsregim och ska inte tolkas som alla ekonomiskt korta exponeringar. Officiell enrichment är additiv och får inte fabricera ett värde när källan saknar data." : "Bolagsverket covers digitally filed annual reports rather than automatically every historical Swedish annual report. FI aggregate short positions follow FI's reporting regime and are not equivalent to every economically short exposure. Official enrichment is additive and must not manufacture a value when a source has no data."}</p></section>
    </div>
  </Container></Section>;
}
