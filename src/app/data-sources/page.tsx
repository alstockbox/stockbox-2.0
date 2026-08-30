import type { Metadata } from "next";
import { Card, Container, Section } from "@/components/ui/card";
import { getLocale } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Data Sources",
  description: "How StockBox sources, reconciles and labels financial statements, market observations and missing data.",
};

const sources = [
  ["SEC filings", "Primary filing facts are used for supported SEC issuers when compatible concepts and periods can be reconciled."],
  ["Yahoo Finance fundamentals", "A broad secondary fundamentals source used to extend compatible global coverage where primary filing facts are unavailable."],
  ["Yahoo Finance / Stooq market data", "Market observations such as price history can be sourced from configured market-data providers and retain timestamps."],
  ["StockBox calculations", "Ratios, normalized metrics, scoring and valuation logic are calculated in versioned application code from the available inputs."],
] as const;

export default async function DataSourcesPage() {
  const locale = await getLocale();
  const sv = locale === "sv";
  return <Section><Container className="max-w-5xl">
    <p className="text-sm font-semibold text-[#e1cb95]">{sv ? "Datakällor" : "Data sources"}</p>
    <h1 className="serif mt-2 text-4xl font-semibold">{sv ? "Varifrån StockBox får sina siffror" : "Where StockBox gets its financial data"}</h1>
    <p className="mt-5 max-w-3xl text-base leading-7 text-[#c9d2df]">{sv ? "StockBox kombinerar källor efter tillgänglighet och kompatibilitet. En datapunkt märks inte som filing-data om den inte faktiskt kommer från den källan." : "StockBox combines sources based on availability and compatibility. A data point is not described as filing data unless it actually came from that source."}</p>
    <div className="mt-10 grid gap-4 md:grid-cols-2">
      {sources.map(([title, text]) => <Card key={title}><h2 className="font-semibold text-[#f4efe5]">{title}</h2><p className="mt-2 text-sm leading-6 text-[#9aa7b8]">{text}</p></Card>)}
    </div>
    <div className="mt-10 space-y-5 text-sm leading-7 text-[#c9d2df]">
      <section><h2 className="text-lg font-semibold text-[#f4efe5]">{sv ? "Källhierarki och konflikter" : "Source hierarchy and conflicts"}</h2><p className="mt-2">{sv ? "När kompatibla källor skiljer sig bevaras konflikten och kan sänka täckning, konfidens eller blockera ett mått. StockBox ersätter inte okänd data med noll." : "When compatible sources disagree, the conflict is preserved and can reduce coverage, confidence or block a metric. StockBox does not replace unknown data with zero."}</p></section>
      <section><h2 className="text-lg font-semibold text-[#f4efe5]">{sv ? "Valutor och perioder" : "Currencies and periods"}</h2><p className="mt-2">{sv ? "Värdering kräver kompatibla enheter, perioder och valutor. Om de inte kan verifieras markeras värderingen som otillgänglig i stället för att tvingas fram." : "Valuation requires compatible units, periods and currencies. If they cannot be verified, valuation is marked unavailable rather than forced."}</p></section>
      <section><h2 className="text-lg font-semibold text-[#f4efe5]">{sv ? "Uppdateringsfrekvens" : "Freshness"}</h2><p className="mt-2">{sv ? "Rapporter visar rapport- och marknadsdatum. Providerdata kan vara fördröjd, EOD-baserad eller ofullständig beroende på marknad och datapunkt." : "Reports expose financial and market observation dates. Provider data may be delayed, end-of-day or incomplete depending on the market and data point."}</p></section>
    </div>
  </Container></Section>;
}
