import type { Metadata } from "next";
import { Container, Section } from "@/components/ui/card";
import { getLocale } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Answers about StockBox data, analysis limits, ratings, missing data, markets and subscriptions.",
};

const en = [
  ["Where does StockBox get its data?", "StockBox uses configured financial and market-data providers including SEC filing facts for supported issuers and broader fundamentals/market observations from Yahoo Finance and Stooq. Source context is retained in reports."],
  ["Is StockBox financial advice?", "No. StockBox is a research tool. It does not know your full financial circumstances and does not provide individualized financial advice or execute trades."],
  ["What happens when data is missing?", "Missing data stays missing. It can lower coverage or confidence, make a dimension unavailable, or result in No Rating."],
  ["What is a deep report?", "A deep report uses the same factual engine but exposes substantially more explanation, evidence, assumptions and research context than a summary report."],
  ["Which markets are supported?", "Company discovery is global, but analysis depth depends on provider coverage, security type, currency alignment and whether the company can be mapped to a supported analytical archetype."],
  ["Can I cancel anytime?", "Paid subscriptions renew monthly until cancelled. Future renewals can be cancelled from Billing; applicable consumer withdrawal rights are handled separately."],
  ["Does StockBox use AI?", "Financial inputs, ratios, scores and valuation logic are not invented by a language model. Any language-generation feature must remain grounded in the report data and is feature-gated until production-ready."],
  ["How often is data updated?", "Financial statement freshness follows the latest compatible provider facts and filings; market observations may be delayed or end-of-day depending on provider and market."],
] as const;
const sv = [
  ["Varifrån får StockBox sin data?", "StockBox använder konfigurerade finans- och marknadsdatakällor, bland annat SEC-filingfakta för stödda bolag samt bredare fundamenta och marknadsobservationer från Yahoo Finance och Stooq. Källkontext bevaras i rapporterna."],
  ["Är StockBox finansiell rådgivning?", "Nej. StockBox är ett researchverktyg. Tjänsten känner inte till hela din ekonomiska situation, lämnar inte individanpassad finansiell rådgivning och utför inte handel."],
  ["Vad händer när data saknas?", "Saknad data förblir saknad. Det kan sänka täckning eller konfidens, göra en dimension otillgänglig eller leda till No Rating."],
  ["Vad är en djup rapport?", "En djup rapport använder samma faktamotor men visar betydligt mer förklaring, evidens, antaganden och researchkontext än en översiktsrapport."],
  ["Vilka marknader stöds?", "Bolag kan sökas globalt, men analysdjupet beror på datatäckning, värdepapperstyp, valutaöverensstämmelse och om bolaget kan kopplas till en stödd analyskategori."],
  ["Kan jag avsluta när som helst?", "Betalda abonnemang förnyas månadsvis tills de avslutas. Framtida förnyelser kan stoppas under Betalning; tillämplig konsumentångerrätt hanteras separat."],
  ["Använder StockBox AI?", "Finansiella indata, nyckeltal, poäng och värderingslogik hittas inte på av en språkmodell. Språkgenererande funktioner ska vara grundade i rapportdata och är feature-gated tills de är produktionsklara."],
  ["Hur ofta uppdateras data?", "Finansiell aktualitet följer de senaste kompatibla providerfakta och rapporterna. Marknadsobservationer kan vara fördröjda eller EOD-baserade beroende på leverantör och marknad."],
] as const;

export default async function FaqPage() {
  const locale = await getLocale();
  const items = locale === "sv" ? sv : en;
  return <Section><Container className="max-w-4xl">
    <p className="text-sm font-semibold text-[#e1cb95]">FAQ</p>
    <h1 className="serif mt-2 text-4xl font-semibold">{locale === "sv" ? "Vanliga frågor om StockBox" : "Frequently asked questions about StockBox"}</h1>
    <div className="mt-10 divide-y divide-white/10 rounded-xl border border-white/10 bg-white/[0.03] px-5">
      {items.map(([question, answer]) => <details key={question} className="py-5"><summary className="cursor-pointer font-semibold text-[#f4efe5]">{question}</summary><p className="mt-3 max-w-3xl text-sm leading-7 text-[#9aa7b8]">{answer}</p></details>)}
    </div>
  </Container></Section>;
}
