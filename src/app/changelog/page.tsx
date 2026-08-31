import type { Metadata } from "next";
import { Container, Section } from "@/components/ui/card";
import { MODEL_VERSION, REPORT_SCHEMA_VERSION, SCORE_POLICY_VERSION } from "@/lib/analysis/config";
import { getLocale } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Changelog",
  description: "StockBox product and analysis-engine release notes, with versioned methodology and reliability changes.",
  alternates: { canonical: "/changelog" },
};

const releases = [
  {
    date: "2026-08-31",
    title: "Release hardening",
    en: [
      "Added public sample research, comparison, clearer data-source and methodology documentation, and a cleaner marketing/app navigation split.",
      "Hardened subscription plan access, affiliate discounts and ambassador giveaways around one canonical server-side plan model.",
      "Added a public withdrawal form and durable first-purchase contract confirmation with duplicate-delivery protection.",
      "Removed unfinished AI-assistant and monitoring features from launch plans and customer-facing pricing.",
    ],
    sv: [
      "Lade till publik exempelanalys, j\u00e4mf\u00f6relse, tydligare dokumentation av datak\u00e4llor och metodik samt separerad webb- och appnavigation.",
      "H\u00e4rdade abonnemang, affiliate-rabatter och ambassador-giveaways runt en gemensam serverstyrd r\u00e4ttighetsmodell.",
      "Lade till publik \u00e5ngerblankett och varaktig avtalsbekr\u00e4ftelse efter f\u00f6rsta k\u00f6p med skydd mot dubbla utskick.",
      "Tog bort of\u00e4rdiga AI-assistent- och bevakningsr\u00e4ttigheter fr\u00e5n lanseringsplaner och kundtexter.",
    ],
  },
  {
    date: "2026-08-28",
    title: "Analysis Engine v2.7",
    en: ["Strengthened archetype-aware analysis, source reconciliation, coverage/confidence handling, deterministic scoring and reproducibility checks."],
    sv: ["F\u00f6rst\u00e4rkte archetype-anpassad analys, k\u00e4llavst\u00e4mning, coverage/confidence, deterministisk scoring och reproducerbarhetskontroller."],
  },
] as const;

export default async function ChangelogPage() {
  const locale = await getLocale();
  const sv = locale === "sv";
  return <Section><Container className="max-w-4xl">
    <p className="text-sm font-semibold text-[#e1cb95]">{sv ? "Versionshistorik" : "Release history"}</p>
    <h1 className="serif mt-2 text-4xl font-semibold">{sv ? "StockBox changelog" : "StockBox changelog"}</h1>
    <p className="mt-4 max-w-3xl text-sm leading-7 text-[#9aa7b8]">{sv ? "Produkt- och metodf\u00f6r\u00e4ndringar dokumenteras h\u00e4r s\u00e5 att rapporter kan f\u00f6rst\u00e5s i sitt versionssammanhang." : "Product and methodology changes are documented here so reports can be understood in their version context."}</p>
    <div className="mt-6 rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-[#c9d2df]">
      <p><strong className="text-[#f4efe5]">{sv ? "Nuvarande motor" : "Current engine"}:</strong> {MODEL_VERSION}</p>
      <p><strong className="text-[#f4efe5]">{sv ? "Scoringpolicy" : "Scoring policy"}:</strong> {SCORE_POLICY_VERSION}</p>
      <p><strong className="text-[#f4efe5]">{sv ? "Rapportschema" : "Report schema"}:</strong> {REPORT_SCHEMA_VERSION}</p>
    </div>
    <div className="mt-10 space-y-8">
      {releases.map((release) => <article key={release.date} className="border-l border-[#e1cb95]/35 pl-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#e1cb95]">{release.date}</p>
        <h2 className="mt-2 text-xl font-semibold text-[#f4efe5]">{release.title}</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-[#c9d2df]">{(sv ? release.sv : release.en).map((item) => <li key={item}>{item}</li>)}</ul>
      </article>)}
    </div>
  </Container></Section>;
}
