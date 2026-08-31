import type { Metadata } from "next";
import Link from "next/link";
import { Card, Container, Section } from "@/components/ui/card";
import { getLocale } from "@/lib/i18n/server";
import { getLegalSeller } from "@/lib/legal/commerce";

export const metadata: Metadata = {
  title: "About StockBox",
  description: "What StockBox is, who it is built for, how it approaches equity research, and how to contact the team.",
};

export default async function AboutPage() {
  const locale = await getLocale();
  const seller = getLegalSeller();
  const sv = locale === "sv";
  return <Section><Container className="max-w-5xl">
    <p className="text-sm font-semibold text-[#e1cb95]">{sv ? "Om StockBox" : "About StockBox"}</p>
    <h1 className="serif mt-2 max-w-3xl text-4xl font-semibold">{sv ? "Byggt för investerare som vill se underlaget — inte bara svaret" : "Built for investors who want to see the evidence — not just the answer"}</h1>
    <p className="mt-5 max-w-3xl text-base leading-7 text-[#c9d2df]">{sv ? "StockBox är en svensk webbaserad researchplattform för fundamental bolagsanalys. Den samlar finansiell data, versionsstyrda beräkningar och källinformation i en strukturerad rapport för din egen analys." : "StockBox is a Swedish web-based research platform for fundamental company analysis. It combines financial data, versioned calculations and source context in a structured report for your own research."}</p>
    <div className="mt-10 grid gap-4 md:grid-cols-3">
      <Card><h2 className="font-semibold text-[#f4efe5]">{sv ? "Varför" : "Why"}</h2><p className="mt-2 text-sm leading-6 text-[#9aa7b8]">{sv ? "Minska tiden mellan en bolagsrapport och en strukturerad researchbild, utan att låta saknad data fyllas med gissningar." : "Reduce the time from company disclosures to a structured research view without filling missing evidence with guesses."}</p></Card>
      <Card><h2 className="font-semibold text-[#f4efe5]">{sv ? "För vem" : "For whom"}</h2><p className="mt-2 text-sm leading-6 text-[#9aa7b8]">{sv ? "Självständiga investerare som vill granska värdering, tillväxt, lönsamhet, finansiell hälsa, kvalitet och risk." : "Independent investors reviewing valuation, growth, profitability, financial health, quality and risk."}</p></Card>
      <Card><h2 className="font-semibold text-[#f4efe5]">{sv ? "Vad vi inte gör" : "What we do not do"}</h2><p className="mt-2 text-sm leading-6 text-[#9aa7b8]">{sv ? "StockBox förvaltar inte pengar, utför inte handel och lämnar inte individanpassad finansiell rådgivning." : "StockBox does not manage money, execute trades or provide individualized financial advice."}</p></Card>
    </div>
    <div className="mt-10 rounded-xl border border-white/10 bg-white/[0.03] p-6">
      <h2 className="text-lg font-semibold text-[#f4efe5]">{sv ? "Operatör och kontakt" : "Operator and contact"}</h2>
      {seller.businessName ? <p className="mt-3 text-sm text-[#c9d2df]">{seller.businessName}{seller.organizationNumber ? ` · ${seller.organizationNumber}` : ""}</p> : <p className="mt-3 text-sm text-[#9aa7b8]">{sv ? "Operatörsuppgifter lämnas här och i köpinformationen innan ett betalt abonnemang erbjuds." : "Operator details are provided here and in the purchase information before a paid subscription is offered."}</p>}
      {seller.postalAddress ? <p className="mt-1 text-sm text-[#9aa7b8]">{seller.postalAddress}</p> : null}
      <p className="mt-4 text-sm"><Link href="/contact" className="font-semibold text-[#e1cb95] hover:text-white">{sv ? "Kontakta StockBox" : "Contact StockBox"}</Link></p>
    </div>
  </Container></Section>;
}
