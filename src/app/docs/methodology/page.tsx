import type { Metadata } from "next";
import Link from "next/link";
import { Card, Container, Section } from "@/components/ui/card";
import { MODEL_VERSION } from "@/lib/analysis/config";
import { getLocale } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Stock Analysis Methodology",
  description: "How StockBox evaluates valuation, growth, profitability, financial health, quality, risk, coverage and confidence.",
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
  return <Section><Container className="max-w-5xl">
    <p className="text-sm font-semibold text-[#e1cb95]">{sv ? "Nuvarande motor" : "Current engine"}: {MODEL_VERSION}</p>
    <h1 className="serif mt-2 text-4xl font-semibold">{sv ? "Så bygger StockBox en aktieanalys" : "How StockBox builds an equity analysis"}</h1>
    <p className="mt-5 max-w-3xl text-base leading-7 text-[#c9d2df]">{sv ? "Motorn separerar källfakta, deterministiska beräkningar, scoring och presentation. Saknad eller konfliktfylld data kan sänka täckning och konfidens eller blockera en bedömning." : "The engine separates source facts, deterministic calculations, scoring and presentation. Missing or conflicting data can lower coverage and confidence or block an assessment."}</p>
    <div className="mt-10 grid gap-4 md:grid-cols-2">
      {dimensions.map(([title, text]) => <Card key={title}><h2 className="text-lg font-semibold text-[#f4efe5]">{title}</h2><p className="mt-2 text-sm leading-6 text-[#9aa7b8]">{text}</p></Card>)}
    </div>
    <div className="mt-10 grid gap-8 text-sm leading-7 text-[#c9d2df] md:grid-cols-2">
      <section><h2 className="text-lg font-semibold text-[#f4efe5]">Coverage and confidence</h2><p className="mt-2">A dimension must reach a minimum evidence threshold before it can contribute normally. Report-level confidence reflects data coverage, consistency and model constraints; it is not a probability of future returns.</p></section>
      <section><h2 className="text-lg font-semibold text-[#f4efe5]">Archetypes</h2><p className="mt-2">Banks, insurers, REITs and other specialized businesses are not forced through identical industrial-company logic. Unsupported archetypes can return No Rating instead of an unsuitable score.</p></section>
      <section><h2 className="text-lg font-semibold text-[#f4efe5]">Profile-weighted, facts unchanged</h2><p className="mt-2">Research profiles can change dimension weights and presentation emphasis. They do not rewrite company facts, source values or deterministic calculations and are not a personal suitability assessment.</p></section>
      <section><h2 className="text-lg font-semibold text-[#f4efe5]">Ratings and valuation constraints</h2><p className="mt-2">Directional model ratings require sufficient score, confidence and valuation support. When the evidence is insufficient, StockBox returns No Rating rather than forcing a directional output.</p></section>
    </div>
    <div className="mt-10 rounded-xl border border-[#e1cb95]/20 bg-[#e1cb95]/5 p-6">
      <h2 className="text-lg font-semibold text-[#f4efe5]">{sv ? "Kontinuerlig förbättring utan självmodifierande produktion" : "Continuous improvement without self-modifying production"}</h2>
      <p className="mt-2 text-sm leading-7 text-[#c9d2df]">{sv ? "Batch-QA, felklassificering, providerdiagnostik och regressionssviter används för kalibrering. En ändring i scoring eller datalogik kräver ny versionsidentifiering och tester innan den når produktion; motorn ändrar aldrig sina regler autonomt från användarresultat." : "Batch QA, failure classification, provider diagnostics and regression suites feed calibration. Any scoring or data-logic change requires a new version and tests before production; the engine never autonomously rewrites its rules from user outcomes."}</p>
    </div>
    <p className="mt-8 border-t border-white/10 pt-6 text-xs leading-6 text-[#9aa7b8]">Static benchmarks are versioned fallbacks, not live peer comparisons. Model ratings are research outputs, not guaranteed outcomes or individualized financial advice. <Link href="/data-sources" className="text-[#e1cb95] hover:text-white">{sv ? "Läs om datakällorna" : "Read about data sources"}</Link>.</p>
  </Container></Section>;
}
