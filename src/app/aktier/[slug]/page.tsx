import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { Card, Container, Section } from "@/components/ui/card";
import { SeoBreadcrumbs, SeoJsonLd, breadcrumbJsonLd } from "@/components/seo/seo-shell";
import { getCachedPublicStockSnapshotBySlug } from "@/lib/seo/public-snapshots";

export const dynamic = "force-dynamic";

function percent(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const normalized = Math.abs(value) <= 1 ? value * 100 : value;
  return `${normalized.toFixed(digits)}%`;
}

function multiple(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(1)}×` : null;
}

function number(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("sv-SE", { maximumFractionDigits: 2 }) : null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const snapshot = await getCachedPublicStockSnapshotBySlug(slug);
  if (!snapshot) return { title: "Aktieanalys hittades inte", robots: { index: false, follow: false } };
  const title = `${snapshot.companyName} aktieanalys – värdering, P/E & StockBox Score`;
  return {
    title,
    description: snapshot.metaDescription,
    alternates: { canonical: `/aktier/${snapshot.slug}` },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description: snapshot.metaDescription,
      type: "article",
      url: `/aktier/${snapshot.slug}`,
    },
  };
}

export default async function PublicStockPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const snapshot = await getCachedPublicStockSnapshotBySlug(slug);
  if (!snapshot) notFound();

  const report = snapshot.report;
  const financialMetrics = report.engine?.metrics;
  const valuation = financialMetrics?.valuation;
  const growth = financialMetrics?.growth;
  const margins = financialMetrics?.margins;
  const ratios = financialMetrics?.ratios;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.getstockbox.app";
  const url = new URL(`/aktier/${snapshot.slug}`, baseUrl).toString();
  const breadcrumbs = [
    { label: "StockBox", href: "/" },
    { label: "Aktier", href: "/aktier" },
    { label: snapshot.companyName, href: `/aktier/${snapshot.slug}` },
  ];
  const factGroups = [
    ["P/E", multiple(valuation?.priceEarnings)],
    ["EV/EBITDA", multiple(valuation?.evEbitda)],
    ["FCF-yield", percent(valuation?.freeCashFlowYield)],
    ["Omsättningstillväxt", percent(growth?.revenueGrowthYoY)],
    ["3-årig omsättnings-CAGR", percent(growth?.revenueCagr3y)],
    ["Rörelsemarginal", percent(margins?.operatingMargin)],
    ["Nettomarginal", percent(margins?.netMargin)],
    ["ROIC", percent(ratios?.returnOnInvestedCapital)],
    ["Skuld/eget kapital", number(ratios?.debtToEquity)],
  ].filter((item): item is [string, string] => Boolean(item[1]));

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      breadcrumbJsonLd(baseUrl, breadcrumbs),
      {
        "@type": ["Article", "WebPage"],
        "@id": `${url}#analysis`,
        url,
        headline: `${snapshot.companyName} aktieanalys`,
        description: snapshot.metaDescription,
        datePublished: snapshot.publishedAt,
        dateModified: snapshot.updatedAt,
        inLanguage: "sv-SE",
        isAccessibleForFree: true,
        publisher: { "@id": `${baseUrl.replace(/\/$/, "")}/#organization` },
        author: { "@id": `${baseUrl.replace(/\/$/, "")}/#organization` },
        about: { "@type": "Corporation", name: snapshot.companyName, tickerSymbol: snapshot.ticker },
        citation: report.sources.map((source) => source.url),
        mainEntityOfPage: url,
      },
    ],
  };

  return (
    <>
      <SeoJsonLd data={structuredData} />
      <Section className="subtle-grid border-b border-white/10 pb-10 pt-14">
        <Container className="max-w-5xl">
          <SeoBreadcrumbs items={breadcrumbs} />
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="font-mono text-sm font-semibold text-[#e1cb95]">{snapshot.ticker}</p>
              <h1 className="serif mt-2 text-4xl font-semibold text-[#f4efe5] sm:text-5xl">{snapshot.companyName} aktieanalys</h1>
              <p className="mt-4 max-w-3xl text-base leading-8 text-[#c9d2df]">{report.oneSentence || report.summary}</p>
            </div>
            {snapshot.score !== null ? <div className="rounded-xl border border-[#e1cb95]/30 bg-[#0b1829] p-5 text-center"><p className="text-xs uppercase tracking-[0.12em] text-[#9aa7b8]">StockBox Score</p><p className="number mt-2 text-4xl font-semibold text-[#e1cb95]">{Math.round(snapshot.score)}<span className="text-lg text-[#9aa7b8]">/100</span></p></div> : null}
          </div>
          <div className="mt-7 flex flex-wrap gap-3 text-xs text-[#9aa7b8]">
            {snapshot.confidence !== null ? <span>Konfidens: {percent(snapshot.confidence, 0)}</span> : null}
            {snapshot.dataCoverage !== null ? <span>Datatäckning: {percent(snapshot.dataCoverage, 0)}</span> : null}
            {snapshot.dataAsOf ? <span>Data t.o.m. {new Date(snapshot.dataAsOf).toLocaleDateString("sv-SE")}</span> : null}
            {report.modelVersion ? <span>Modell: {report.modelVersion}</span> : null}
          </div>
        </Container>
      </Section>

      <Section className="py-10">
        <Container className="max-w-5xl space-y-6">
          <Card className="p-6 sm:p-8">
            <h2 className="serif text-3xl font-semibold text-[#f4efe5]">StockBox sammanfattning</h2>
            <p className="mt-4 whitespace-pre-line text-sm leading-7 text-[#c9d2df] sm:text-base">{report.summary}</p>
          </Card>

          {report.score.dimensions.some((dimension) => dimension.score !== null) ? (
            <Card className="p-6 sm:p-8">
              <h2 className="serif text-3xl font-semibold text-[#f4efe5]">Vad driver StockBox Score?</h2>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {report.score.dimensions.filter((dimension) => dimension.score !== null).map((dimension) => (
                  <div key={dimension.key} className="rounded-lg border border-white/10 bg-white/[0.025] p-4">
                    <div className="flex items-center justify-between gap-3"><span className="font-semibold text-[#f4efe5]">{dimension.label}</span><span className="number text-[#e1cb95]">{Math.round(dimension.score ?? 0)}/100</span></div>
                    {dimension.rationale ? <p className="mt-2 text-xs leading-6 text-[#9aa7b8]">{dimension.rationale}</p> : null}
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {factGroups.length > 0 ? (
            <Card className="p-6 sm:p-8">
              <h2 className="serif text-3xl font-semibold text-[#f4efe5]">Värdering och fundamenta</h2>
              <p className="mt-3 text-sm leading-7 text-[#9aa7b8]">Nyckeltalen nedan kommer från den publicerade StockBox-snapshoten. Saknade datapunkter fylls inte ut.</p>
              <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {factGroups.map(([label, value]) => <div key={label} className="rounded-lg border border-white/10 p-4"><dt className="text-xs text-[#9aa7b8]">{label}</dt><dd className="number mt-1 text-xl font-semibold text-[#f4efe5]">{value}</dd></div>)}
              </dl>
              <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs leading-6 text-[#9aa7b8]">
                <Link href="/nyckeltal/pe-tal" className="font-semibold text-[#e1cb95] hover:text-white">Förstå P/E-tal</Link>
                <Link href="/nyckeltal/ev-ebitda" className="font-semibold text-[#e1cb95] hover:text-white">Förstå EV/EBITDA</Link>
                <Link href="/nyckeltal/roic" className="font-semibold text-[#e1cb95] hover:text-white">Förstå ROIC</Link>
                <Link href="/nyckeltal/fritt-kassaflode" className="font-semibold text-[#e1cb95] hover:text-white">Förstå fritt kassaflöde</Link>
              </div>
            </Card>
          ) : null}

          {(report.greenFlags.length > 0 || report.redFlags.length > 0) ? (
            <div className="grid gap-6 md:grid-cols-2">
              <Card><h2 className="text-xl font-semibold text-[#f4efe5]">Styrkor i snapshoten</h2><div className="mt-4 space-y-3">{report.greenFlags.length ? report.greenFlags.map((flag) => <div key={`${flag.title}-${flag.detail}`}><p className="text-sm font-semibold text-[#d8e9d3]">{flag.title}</p><p className="mt-1 text-xs leading-6 text-[#9aa7b8]">{flag.detail}</p></div>) : <p className="text-sm text-[#9aa7b8]">Inga explicita gröna flaggor i snapshoten.</p>}</div></Card>
              <Card><h2 className="text-xl font-semibold text-[#f4efe5]">Risker och svagheter</h2><div className="mt-4 space-y-3">{report.redFlags.length ? report.redFlags.map((flag) => <div key={`${flag.title}-${flag.detail}`}><p className="text-sm font-semibold text-[#f1c5c5]">{flag.title}</p><p className="mt-1 text-xs leading-6 text-[#9aa7b8]">{flag.detail}</p></div>) : <p className="text-sm text-[#9aa7b8]">Inga explicita röda flaggor i snapshoten.</p>}</div></Card>
            </div>
          ) : null}

          <Card className="p-6 sm:p-8">
            <h2 className="serif text-3xl font-semibold text-[#f4efe5]">Källor och metodik</h2>
            <p className="mt-3 text-sm leading-7 text-[#c9d2df]">StockBox bevarar datakällor och proveniens för rapporten. Den här sidan är en daterad snapshot och ska inte tolkas som realtidsdata.</p>
            {report.sources.length > 0 ? <ul className="mt-5 space-y-2 text-sm">{report.sources.map((source) => <li key={`${source.name}-${source.url}`}><a href={source.url} rel="nofollow noreferrer" className="font-semibold text-[#e1cb95] hover:text-white">{source.name}</a>{source.dataAsOf ? <span className="text-[#7f8b9b]"> · data {source.dataAsOf}</span> : null}</li>)}</ul> : null}
            <div className="mt-5 flex flex-wrap gap-4 text-sm"><Link href="/docs/methodology" className="font-semibold text-[#e1cb95] hover:text-white">StockBox metodik</Link><Link href="/data-sources" className="font-semibold text-[#e1cb95] hover:text-white">Datakällor</Link><Link href="/fundamental-analys" className="font-semibold text-[#e1cb95] hover:text-white">Fundamental analys</Link><Link href="/nyckeltal" className="font-semibold text-[#e1cb95] hover:text-white">Nyckeltalsguider</Link></div>
          </Card>

          <Card className="border-[#e1cb95]/25 p-6 sm:p-8">
            <h2 className="serif text-3xl font-semibold text-[#f4efe5]">Kör en ny analys</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-[#c9d2df]">Den publika sidan är en snapshot. Kör en egen StockBox-analys för att använda den senaste tillgängliga datan och ditt valda researchflöde.</p>
            <ButtonLink href="/#research" className="mt-5">Analysera en aktie gratis</ButtonLink>
            <p className="mt-5 text-xs leading-6 text-[#7f8b9b]">{report.disclaimer || "StockBox är ett analysverktyg och ger inte individanpassad finansiell rådgivning."}</p>
          </Card>
        </Container>
      </Section>
    </>
  );
}
