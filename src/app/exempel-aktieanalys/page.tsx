import type { Metadata } from "next";
import Link from "next/link";
import { ReportView } from "@/components/analysis/report-view";
import { SeoJsonLd, breadcrumbJsonLd } from "@/components/seo/seo-shell";
import { Card, Container, Section } from "@/components/ui/card";
import { formatAnalysisTimestamp } from "@/lib/analysis/timestamp";
import { getPublicSampleAnalysis } from "@/lib/analysis/public-sample";
import { captureServerEvent } from "@/lib/analytics/events";

export const metadata: Metadata = {
  title: "Exempel på aktieanalys – riktig StockBox Deep Analysis",
  description: "Se ett verkligt exempel på en StockBox aktieanalys med StockBox Score, värdering, finansiella nyckeltal, datatäckning, risker, källor och modellversion.",
  alternates: {
    canonical: "/exempel-aktieanalys",
    languages: {
      "sv-SE": "/exempel-aktieanalys",
      "en": "/sample-analysis",
    },
  },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Exempel på aktieanalys – riktig StockBox Deep Analysis",
    description: "Se hur en riktig StockBox Deep Analysis ser ut med score, fundamenta, risker, källor och synliga databegränsningar.",
    type: "article",
    url: "/exempel-aktieanalys",
  },
};

export const dynamic = "force-dynamic";

export default async function SwedishSampleAnalysisPage() {
  captureServerEvent("sample_analysis_view", { locale: "sv", surface: "seo_example" });
  const locale = "sv" as const;
  const report = await getPublicSampleAnalysis();

  if (!report) {
    return <Section><Container className="max-w-3xl"><Card><h1 className="serif text-3xl font-semibold">Exempel på aktieanalys</h1><p className="mt-3 text-sm leading-7 text-[#9aa7b8]">Den godkända exempelrapporten är tillfälligt otillgänglig. StockBox genererar inga ersättningssiffror för att fylla demon.</p></Card></Container></Section>;
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.getstockbox.app";
  const pageUrl = new URL("/exempel-aktieanalys", baseUrl).toString();
  const breadcrumbs = [
    { label: "StockBox", href: "/" },
    { label: "Exempel på aktieanalys", href: "/exempel-aktieanalys" },
  ];
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      breadcrumbJsonLd(baseUrl, breadcrumbs),
      {
        "@type": ["Article", "WebPage"],
        "@id": `${pageUrl}#sample-analysis`,
        url: pageUrl,
        headline: `Exempel på aktieanalys – ${report.companyName}`,
        description: metadata.description,
        datePublished: report.generatedAt,
        dateModified: report.generatedAt,
        inLanguage: "sv-SE",
        isAccessibleForFree: true,
        softwareVersion: report.modelVersion,
        publisher: { "@id": `${baseUrl.replace(/\/$/, "")}/#organization` },
        author: { "@id": `${baseUrl.replace(/\/$/, "")}/#organization` },
        about: { "@type": "Corporation", name: report.companyName, tickerSymbol: report.ticker },
        citation: report.sources.map((source) => source.url),
        mainEntityOfPage: pageUrl,
      },
    ],
  };

  return <>
    <SeoJsonLd data={structuredData} />
    <Section className="subtle-grid border-b border-white/10 pb-8 pt-12">
      <Container className="max-w-6xl">
        <div className="rounded-xl border border-[#b99b5f]/30 bg-[#b99b5f]/10 p-5 sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#e1cb95]">Verklig Deep Analysis</p>
          <h1 className="serif mt-2 text-3xl font-semibold text-[#f4efe5] sm:text-4xl">Exempel på aktieanalys – så ser en riktig StockBox-rapport ut</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[#c9d2df] sm:text-base">Rapporten nedan är en oföränderlig analys som StockBox faktiskt genererat. Siffror fylls inte ut för demon och saknade datapunkter behålls som saknade. Det gör sidan användbar både som produktbevis och som ett transparent exempel på hur StockBox presenterar research.</p>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#9aa7b8]">
            <span>{report.companyName} · {report.ticker}</span>
            <span>Analyserad: {formatAnalysisTimestamp(report.generatedAt, locale)}</span>
            <span>Modell: {report.modelVersion}</span>
            <span>Analystyp: {report.analysisType}</span>
          </div>
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <Link href="/docs/methodology" className="font-semibold text-[#e1cb95] hover:text-white">Metodik</Link>
            <Link href="/data-sources" className="font-semibold text-[#e1cb95] hover:text-white">Datakällor</Link>
            <Link href="/research-standard" className="font-semibold text-[#e1cb95] hover:text-white">Research Standard</Link>
            <Link href="/aktier" className="font-semibold text-[#e1cb95] hover:text-white">Publika aktieanalyser</Link>
          </div>
        </div>
      </Container>
    </Section>
    <Section className="py-8"><Container><ReportView report={report} mode="pro" locale={locale} /></Container></Section>
  </>;
}
