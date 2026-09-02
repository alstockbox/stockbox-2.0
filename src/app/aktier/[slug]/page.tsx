import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { Card, Container, Section } from "@/components/ui/card";
import { SeoBreadcrumbs, SeoJsonLd, breadcrumbJsonLd } from "@/components/seo/seo-shell";
import { getCachedPublicStockSnapshotBySlug } from "@/lib/seo/public-snapshots";

export const dynamic = "force-dynamic";

type PublicSecurityFactor = {
  key?: string;
  label?: string;
  value?: number | null;
  score?: number | null;
  status?: "available" | "missing" | "not_applicable" | string;
  rationale?: string;
};

type PublicSecurityExtension = {
  securityClassification?: {
    kind?: string;
    confidence?: number;
    reason?: string;
  };
  securityAnalysis?: {
    etf?: {
      kind?: string;
      subtype?: string | null;
      score?: { coverage?: number; factors?: PublicSecurityFactor[] };
      warnings?: string[];
    };
    investmentCompany?: {
      kind?: string;
      score?: { coverage?: number; factors?: PublicSecurityFactor[] };
      nav?: {
        total?: number | null;
        perShare?: number | null;
        discountPremium?: number | null;
        source?: string;
        relativeToHistoricalMedian?: number | null;
      };
    };
  };
};

function publicSecurityExtension(report: unknown): PublicSecurityExtension {
  return report as PublicSecurityExtension;
}

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

function securityState(report: unknown, analysisArchetype?: string | null) {
  const security = publicSecurityExtension(report);
  const isEtf = security.securityAnalysis?.etf?.kind === "etf"
    || security.securityClassification?.kind?.endsWith("_etf") === true;
  const isInvestmentCompany = security.securityAnalysis?.investmentCompany?.kind === "investment_company"
    || analysisArchetype === "holding_company";
  return { security, isEtf, isInvestmentCompany };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const snapshot = await getCachedPublicStockSnapshotBySlug(slug);
  if (!snapshot) return { title: "Analys hittades inte", robots: { index: false, follow: false } };

  const { isEtf, isInvestmentCompany } = securityState(
    snapshot.report,
    snapshot.report.engine?.analysisArchetype ?? snapshot.report.analysisArchetype,
  );
  const title = isEtf
    ? `${snapshot.companyName} ETF – analys, kostnad, risk & StockBox Score`
    : isInvestmentCompany
      ? `${snapshot.companyName} investmentbolag – NAV, substansrabatt & StockBox Score`
      : `${snapshot.companyName} aktie – analys, värdering & StockBox Score`;

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
  const { security, isEtf, isInvestmentCompany } = securityState(
    report,
    report.engine?.analysisArchetype ?? report.analysisArchetype,
  );
  const etfAnalysis = security.securityAnalysis?.etf;
  const investmentAnalysis = security.securityAnalysis?.investmentCompany;
  const etfFactors = etfAnalysis?.score?.factors?.filter((factor) => factor.status === "available") ?? [];
  const investmentFactors = investmentAnalysis?.score?.factors?.filter((factor) => factor.status === "available") ?? [];
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
  const factGroups = isEtf ? [] : [
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
  const analysisDate = new Date(snapshot.dataAsOf ?? snapshot.updatedAt).toLocaleDateString("sv-SE");
  const primaryStrength = report.greenFlags[0]?.title ?? "Ingen explicit styrka i snapshoten";
  const primaryRisk = report.redFlags[0]?.title ?? "Ingen explicit risk i snapshoten";
  const peValue = !isEtf && !isInvestmentCompany ? multiple(valuation?.priceEarnings) ?? "Saknas i snapshoten" : null;
  const nav = investmentAnalysis?.nav;
  const navPerShare = number(nav ? nav.perShare : null);
  const discountPremium = nav ? nav.discountPremium : null;
  const discountPremiumText = percent(discountPremium);
  const securityNoun = isEtf ? "ETF" : isInvestmentCompany ? "investmentbolag" : "aktie";
  const pageHeadline = isEtf
    ? `${snapshot.companyName} ETF – StockBox analys`
    : isInvestmentCompany
      ? `${snapshot.companyName} investmentbolag – StockBox analys`
      : `${snapshot.companyName} aktie – StockBox analys`;
  const articleHeadline = isEtf
    ? `${snapshot.companyName} ETF-analys`
    : isInvestmentCompany
      ? `${snapshot.companyName} investmentbolagsanalys`
      : `${snapshot.companyName} aktieanalys`;
  const aboutEntity = isEtf
    ? { "@type": "FinancialProduct", name: snapshot.companyName, category: "ETF" }
    : { "@type": "Corporation", name: snapshot.companyName, tickerSymbol: snapshot.ticker };

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      breadcrumbJsonLd(baseUrl, breadcrumbs),
      {
        "@type": ["Article", "WebPage"],
        "@id": `${url}#analysis`,
        url,
        headline: articleHeadline,
        description: snapshot.metaDescription,
        image: `${url}/opengraph-image`,
        datePublished: snapshot.publishedAt,
        dateModified: snapshot.updatedAt,
        inLanguage: "sv-SE",
        isAccessibleForFree: true,
        publisher: { "@id": `${baseUrl.replace(/\/$/, "")}/#organization` },
        author: { "@id": `${baseUrl.replace(/\/$/, "")}/#organization` },
        about: aboutEntity,
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
              <h1 className="serif mt-2 text-4xl font-semibold text-[#f4efe5] sm:text-5xl">{pageHeadline}</h1>
              <p className="mt-4 max-w-3xl text-base leading-8 text-[#c9d2df]">{report.oneSentence || report.summary}</p>
            </div>
            {snapshot.score !== null ? <div className="rounded-xl border border-[#e1cb95]/30 bg-[#0b1829] p-5 text-center"><p className="text-xs uppercase tracking-[0.12em] text-[#9aa7b8]">StockBox Score</p><p className="number mt-2 text-4xl font-semibold text-[#e1cb95]">{Math.round(snapshot.score)}<span className="text-lg text-[#9aa7b8]">/100</span></p></div> : null}
          </div>
          <div className="mt-7 flex flex-wrap gap-3 text-xs text-[#9aa7b8]">
            {snapshot.confidence !== null ? <span>Konfidens: {percent(snapshot.confidence, 0)}</span> : null}
            {snapshot.dataCoverage !== null ? <span>Datatäckning: {percent(snapshot.dataCoverage, 0)}</span> : null}
            {snapshot.dataAsOf ? <span>Data t.o.m. {new Date(snapshot.dataAsOf).toLocaleDateString("sv-SE")}</span> : null}
            {report.modelVersion ? <span>Modell: {report.modelVersion}</span> : null}
            {isEtf && etfAnalysis?.subtype ? <span>ETF-typ: {etfAnalysis.subtype.replaceAll("_", " ")}</span> : null}
          </div>
        </Container>
      </Section>

      <Section className="py-10">
        <Container className="max-w-5xl space-y-6">
          <Card className="border-[#e1cb95]/20 p-6 sm:p-8">
            <h2 className="serif text-3xl font-semibold text-[#f4efe5]">Snabbfakta om {snapshot.companyName} {securityNoun}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-[#c9d2df]">Det här är ett direkt faktablock från den publicerade StockBox-snapshoten. Det sammanfattar analysläget utan att omvandla modellen till en personlig köp- eller säljrekommendation.</p>
            <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-lg border border-white/10 p-4"><dt className="text-xs text-[#9aa7b8]">StockBox Score</dt><dd className="mt-1 text-base font-semibold text-[#f4efe5]">{snapshot.score !== null ? `${Math.round(snapshot.score)}/100` : "Saknas"}</dd></div>
              <div className="rounded-lg border border-white/10 p-4"><dt className="text-xs text-[#9aa7b8]">Analysdatum</dt><dd className="mt-1 text-base font-semibold text-[#f4efe5]">{analysisDate}</dd></div>
              {peValue ? <div className="rounded-lg border border-white/10 p-4"><dt className="text-xs text-[#9aa7b8]">P/E</dt><dd className="mt-1 text-base font-semibold text-[#f4efe5]">{peValue}</dd></div> : null}
              {isEtf && etfAnalysis?.subtype ? <div className="rounded-lg border border-white/10 p-4"><dt className="text-xs text-[#9aa7b8]">ETF-typ</dt><dd className="mt-1 text-base font-semibold capitalize text-[#f4efe5]">{etfAnalysis.subtype.replaceAll("_", " ")}</dd></div> : null}
              {isInvestmentCompany && navPerShare ? <div className="rounded-lg border border-white/10 p-4"><dt className="text-xs text-[#9aa7b8]">NAV per aktie</dt><dd className="mt-1 text-base font-semibold text-[#f4efe5]">{navPerShare}{report.reportingCurrency ? ` ${report.reportingCurrency}` : ""}</dd></div> : null}
              {isInvestmentCompany && discountPremiumText ? <div className="rounded-lg border border-white/10 p-4"><dt className="text-xs text-[#9aa7b8]">NAV-rabatt / premie</dt><dd className="mt-1 text-base font-semibold text-[#f4efe5]">{discountPremiumText}</dd></div> : null}
              <div className="rounded-lg border border-white/10 p-4 sm:col-span-2 lg:col-span-1"><dt className="text-xs text-[#9aa7b8]">Största styrka</dt><dd className="mt-1 text-sm font-semibold leading-6 text-[#d8e9d3]">{primaryStrength}</dd></div>
              <div className="rounded-lg border border-white/10 p-4 sm:col-span-2"><dt className="text-xs text-[#9aa7b8]">Viktigaste risk</dt><dd className="mt-1 text-sm font-semibold leading-6 text-[#f1c5c5]">{primaryRisk}</dd></div>
            </dl>
          </Card>

          {isEtf ? (
            <Card className="p-6 sm:p-8">
              <h2 className="serif text-3xl font-semibold text-[#f4efe5]">ETF-specifika analysfaktorer</h2>
              <p className="mt-3 text-sm leading-7 text-[#9aa7b8]">ETF-scoren bygger på fondspecifika faktorer från den publicerade rapporten. Saknade faktorer visas inte som noll och företagsmått används inte där de saknar ekonomisk betydelse.</p>
              {etfFactors.length > 0 ? <div className="mt-6 grid gap-4 sm:grid-cols-2">{etfFactors.map((factor) => <div key={factor.key ?? factor.label} className="rounded-lg border border-white/10 bg-white/[0.025] p-4"><div className="flex items-start justify-between gap-4"><p className="font-semibold text-[#f4efe5]">{factor.label ?? factor.key}</p>{typeof factor.score === "number" && Number.isFinite(factor.score) ? <span className="number text-[#e1cb95]">{Math.round(factor.score)}/100</span> : null}</div>{factor.rationale ? <p className="mt-2 text-xs leading-6 text-[#9aa7b8]">{factor.rationale}</p> : null}</div>)}</div> : <p className="mt-5 text-sm text-[#9aa7b8]">Inga ETF-specifika faktorer hade tillräckligt verifierbart underlag i snapshoten.</p>}
              <Link href="/guider/analysera-etf" className="mt-5 inline-block font-semibold text-[#e1cb95] hover:text-white">Så analyserar StockBox ETF:er →</Link>
            </Card>
          ) : null}

          {isInvestmentCompany ? (
            <Card className="p-6 sm:p-8">
              <h2 className="serif text-3xl font-semibold text-[#f4efe5]">Investmentbolag – substansvärde och NAV</h2>
              <p className="mt-3 text-sm leading-7 text-[#c9d2df]">Holding-company-modellen prioriterar verifierat NAV/SOTP framför vanliga rörelsebolagsmultiplar. När officiellt NAV finns i snapshoten kan substansvärde per aktie och rabatt eller premie visas direkt.</p>
              {(navPerShare || discountPremiumText) ? <dl className="mt-5 grid gap-3 sm:grid-cols-2">{navPerShare ? <div className="rounded-lg border border-white/10 p-4"><dt className="text-xs text-[#9aa7b8]">NAV per aktie</dt><dd className="mt-1 text-xl font-semibold text-[#f4efe5]">{navPerShare}{report.reportingCurrency ? ` ${report.reportingCurrency}` : ""}</dd></div> : null}{discountPremiumText ? <div className="rounded-lg border border-white/10 p-4"><dt className="text-xs text-[#9aa7b8]">Rabatt / premie mot NAV</dt><dd className="mt-1 text-xl font-semibold text-[#f4efe5]">{discountPremiumText}</dd></div> : null}</dl> : null}
              {investmentFactors.length > 0 ? <div className="mt-6 grid gap-4 sm:grid-cols-2">{investmentFactors.map((factor) => <div key={factor.key ?? factor.label} className="rounded-lg border border-white/10 bg-white/[0.025] p-4"><div className="flex items-start justify-between gap-4"><p className="font-semibold text-[#f4efe5]">{factor.label ?? factor.key}</p>{typeof factor.score === "number" && Number.isFinite(factor.score) ? <span className="number text-[#e1cb95]">{Math.round(factor.score)}/100</span> : null}</div>{factor.rationale ? <p className="mt-2 text-xs leading-6 text-[#9aa7b8]">{factor.rationale}</p> : null}</div>)}</div> : null}
              <Link href="/guider/analysera-investmentbolag" className="mt-5 inline-block font-semibold text-[#e1cb95] hover:text-white">Guide till investmentbolagsanalys →</Link>
            </Card>
          ) : null}

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
            <div className="mt-5 flex flex-wrap gap-4 text-sm"><Link href="/docs/methodology" className="font-semibold text-[#e1cb95] hover:text-white">StockBox metodik</Link><Link href="/research-standard" className="font-semibold text-[#e1cb95] hover:text-white">Research Standard</Link><Link href="/data-sources" className="font-semibold text-[#e1cb95] hover:text-white">Datakällor</Link>{isEtf ? <Link href="/guider/analysera-etf" className="font-semibold text-[#e1cb95] hover:text-white">ETF-metodik</Link> : null}{isInvestmentCompany ? <Link href="/guider/analysera-investmentbolag" className="font-semibold text-[#e1cb95] hover:text-white">Investmentbolagsmetodik</Link> : null}{!isEtf && !isInvestmentCompany ? <><Link href="/fundamental-analys" className="font-semibold text-[#e1cb95] hover:text-white">Fundamental analys</Link><Link href="/nyckeltal" className="font-semibold text-[#e1cb95] hover:text-white">Nyckeltalsguider</Link></> : null}</div>
          </Card>

          <Card className="border-[#e1cb95]/25 p-6 sm:p-8">
            <h2 className="serif text-3xl font-semibold text-[#f4efe5]">Kör en ny analys</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-[#c9d2df]">Den publika sidan är en snapshot. Kör en egen StockBox-analys för att använda den senaste tillgängliga datan och ditt valda researchflöde.</p>
            <ButtonLink href="/#research" className="mt-5">{isEtf ? "Analysera en ETF" : isInvestmentCompany ? "Analysera ett investmentbolag" : "Analysera en aktie"}</ButtonLink>
            <p className="mt-5 text-xs leading-6 text-[#7f8b9b]">{report.disclaimer || "StockBox är ett analysverktyg och ger inte individanpassad finansiell rådgivning."}</p>
          </Card>
        </Container>
      </Section>
    </>
  );
}
