import type { Metadata } from "next";
import Link from "next/link";
import { Card, Container, Section } from "@/components/ui/card";
import { SeoJsonLd, breadcrumbJsonLd } from "@/components/seo/seo-shell";
import { MODEL_VERSION } from "@/lib/analysis/config";
import { getLocale } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "StockBox metodik – så byggs StockBox Score & aktieanalys",
  description: "Så utvärderar StockBox värdering, tillväxt, lönsamhet, finansiell hälsa, kvalitet, risk, datatäckning och konfidens i en aktieanalys.",
  alternates: { canonical: "/docs/methodology" },
};

const dimensions = [
  ["Valuation", "P/E, EV/EBITDA, EV/Sales, free-cash-flow yield and valuation-specific methods when compatible data is available."],
  ["Growth", "Revenue, earnings, EPS and free-cash-flow growth are evaluated across compatible periods instead of relying on one growth number."],
  ["Profitability", "Margins and capital returns such as ROIC/ROA measure the economics of the operating business."],
  ["Financial health", "Debt, liquidity, cash/debt relationships and interest coverage are used only when the underlying values are reported and compatible."],
  ["Quality", "Capital efficiency, cash conversion, stability and per-share discipline contribute to business and earnings quality."],
  ["Risk", "Balance-sheet resilience and bounded market-risk context are separated from the company-quality assessment."],
] as const;

export default async function MethodologyPage() {
  const locale = await getLocale();
  const sv = locale === "sv";
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.getstockbox.app";
  const breadcrumbs = [{ label: "StockBox", href: "/" }, { label: sv ? "Metodik" : "Methodology", href: "/docs/methodology" }];
  const pageUrl = new URL("/docs/methodology", baseUrl).toString();
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      breadcrumbJsonLd(baseUrl, breadcrumbs),
      {
        "@type": "TechArticle",
        "@id": `${pageUrl}#methodology`,
        url: pageUrl,
        headline: "StockBox stock-analysis methodology",
        description: metadata.description,
        inLanguage: sv ? "sv-SE" : "en",
        version: MODEL_VERSION,
        softwareVersion: MODEL_VERSION,
        publisher: { "@id": `${baseUrl.replace(/\/$/, "")}/#organization` },
        author: { "@id": `${baseUrl.replace(/\/$/, "")}/#organization` },
        about: ["stock analysis", "valuation", "fundamental analysis", "StockBox Score", "financial data quality"],
        isPartOf: { "@id": `${baseUrl.replace(/\/$/, "")}/#website` },
      },
    ],
  };

  return <>
    <SeoJsonLd data={structuredData} />
    <Section><Container className="max-w-5xl">
      <p className="text-sm font-semibold text-[#e1cb95]">{sv ? "Nuvarande motor" : "Current engine"}: {MODEL_VERSION}</p>
      <h1 className="serif mt-2 text-4xl font-semibold">{sv ? "Så bygger StockBox en aktieanalys" : "How StockBox builds an equity analysis"}</h1>
      <p className="mt-5 max-w-3xl text-base leading-7 text-[#c9d2df]">{sv ? "Motorn separerar källfakta, deterministiska beräkningar, scoring och presentation. Saknad eller konfliktfylld data kan sänka täckning och konfidens eller blockera en bedömning." : "The engine separates source facts, deterministic calculations, scoring and presentation. Missing or conflicting data can lower coverage and confidence or block an assessment."}</p>
      <div className="mt-10 grid gap-4 md:grid-cols-2">
        {dimensions.map(([title, text]) => <Card key={title}><h2 className="text-lg font-semibold text-[#f4efe5]">{title}</h2><p className="mt-2 text-sm leading-6 text-[#9aa7b8]">{text}</p></Card>)}
      </div>
      <div className="mt-10 grid gap-8 text-sm leading-7 text-[#c9d2df] md:grid-cols-2">
        <section><h2 className="text-lg font-semibold text-[#f4efe5]">Coverage and confidence</h2><p className="mt-2">A dimension must reach a minimum evidence threshold before it can contribute normally. Report-level confidence reflects data coverage, consistency and model constraints; it is not a probability of future returns.</p></section>
        <section><h2 className="text-lg font-semibold text-[#f4efe5]">Archetypes</h2><p className="mt-2">Banks, insurers, REITs and other specialized businesses are not forced through identical industrial-company logic. Unsupported archetypes can return an insufficient-data research view instead of an unsuitable conclusion.</p></section>
        <section><h2 className="text-lg font-semibold text-[#f4efe5]">Profile-weighted, facts unchanged</h2><p className="mt-2">Research profiles can change dimension weights and presentation emphasis. They do not rewrite company facts, source values or deterministic calculations and are not a personal suitability assessment.</p></section>
        <section><h2 className="text-lg font-semibold text-[#f4efe5]">Research view and valuation constraints</h2><p className="mt-2">The overall research view requires sufficient score, confidence and data coverage. When evidence is insufficient, StockBox shows that limitation rather than forcing a directional investment conclusion.</p></section>
      </div>
      <div className="mt-10 rounded-xl border border-[#e1cb95]/20 bg-[#e1cb95]/5 p-6">
        <h2 className="text-lg font-semibold text-[#f4efe5]">{sv ? "Kontinuerlig förbättring utan självmodifierande produktion" : "Continuous improvement without self-modifying production"}</h2>
        <p className="mt-2 text-sm leading-7 text-[#c9d2df]">{sv ? "Batch-QA, felklassificering, providerdiagnostik och regressionssviter används för kalibrering. En ändring i scoring eller datalogik kräver ny versionsidentifiering och tester innan den når produktion; motorn ändrar aldrig sina regler autonomt från användarresultat." : "Batch QA, failure classification, provider diagnostics and regression suites feed calibration. Any scoring or data-logic change requires a new version and tests before production; the engine never autonomously rewrites its rules from user outcomes."}</p>
      </div>
      <p className="mt-8 border-t border-white/10 pt-6 text-xs leading-6 text-[#9aa7b8]">Static benchmarks are versioned fallbacks, not live peer comparisons. Research views are model-based research outputs, not guaranteed outcomes or individualized financial advice. <Link href="/data-sources" className="text-[#e1cb95] hover:text-white">{sv ? "Läs om datakällorna" : "Read about data sources"}</Link>. <Link href="/nyckeltal" className="ml-2 text-[#e1cb95] hover:text-white">{sv ? "Läs nyckeltalsguider" : "Read metric guides"}</Link>.</p>
    </Container></Section>
  </>;
}
