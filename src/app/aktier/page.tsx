import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Container, Section } from "@/components/ui/card";
import { SeoHero, SeoJsonLd, breadcrumbJsonLd } from "@/components/seo/seo-shell";
import { countPublicStockSnapshots, listPublicStockSnapshotsPage } from "@/lib/seo/public-snapshots";

const TITLE = "Aktier, investmentbolag & ETF – publika StockBox-analyser";
const DESCRIPTION = "Utforska publika StockBox-analyser av aktier, investmentbolag och ETF:er med score, relevanta nyckeltal, risk, datatäckning och synliga datakällor.";
export const PUBLIC_STOCK_HUB_PAGE_SIZE = 48;
export const dynamic = "force-dynamic";

type StocksSearchParams = Promise<{ page?: string | string[] }>;

function resolvePageNumber(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(candidate ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export async function generateMetadata({ searchParams }: { searchParams: StocksSearchParams }): Promise<Metadata> {
  const params = await searchParams;
  const pageNumber = resolvePageNumber(params.page);
  const canonical = pageNumber === 1 ? "/aktier" : `/aktier?page=${pageNumber}`;
  return {
    title: pageNumber === 1 ? TITLE : `Publika StockBox-analyser – sida ${pageNumber}`,
    description: DESCRIPTION,
    alternates: { canonical: pageNumber === 1 ? "/aktier" : `/aktier?page=${pageNumber}` },
    robots: { index: true, follow: true },
    openGraph: {
      title: pageNumber === 1 ? TITLE : `Publika StockBox-analyser – sida ${pageNumber}`,
      description: DESCRIPTION,
      type: "website",
      url: canonical,
    },
  };
}

export default async function StocksPage({ searchParams }: { searchParams: StocksSearchParams }) {
  const params = await searchParams;
  const pageNumber = resolvePageNumber(params.page);
  const pageOffset = (pageNumber - 1) * PUBLIC_STOCK_HUB_PAGE_SIZE;
  const [totalCount, snapshots] = await Promise.all([
    countPublicStockSnapshots(),
    listPublicStockSnapshotsPage(pageNumber - 1, PUBLIC_STOCK_HUB_PAGE_SIZE),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalCount / PUBLIC_STOCK_HUB_PAGE_SIZE));
  if (pageNumber > totalPages) notFound();

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.getstockbox.app";
  const breadcrumbs = [{ label: "StockBox", href: "/" }, { label: "Aktier", href: "/aktier" }];
  const pagePath = pageNumber === 1 ? "/aktier" : `/aktier?page=${pageNumber}`;
  const pageUrl = new URL(pagePath, baseUrl).toString();
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      breadcrumbJsonLd(baseUrl, breadcrumbs),
      {
        "@type": "CollectionPage",
        "@id": `${pageUrl}#collection`,
        url: pageUrl,
        name: pageNumber === 1 ? "Publika StockBox-analyser" : `Publika StockBox-analyser – sida ${pageNumber}`,
        description: DESCRIPTION,
        publisher: { "@id": `${baseUrl.replace(/\/$/, "")}/#organization` },
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: totalCount,
          itemListElement: snapshots.map((snapshot, index) => ({
            "@type": "ListItem",
            position: pageOffset + index + 1,
            name: `${snapshot.companyName} StockBox-analys`,
            url: new URL(`/aktier/${snapshot.slug}`, baseUrl).toString(),
          })),
        },
      },
    ],
  };

  return (
    <>
      <SeoJsonLd data={structuredData} />
      <SeoHero
        eyebrow="Publika analyser"
        title="Aktier, investmentbolag & ETF"
        lead="Här samlar StockBox kvalitetssäkrade, publika analyssnapshots för flera typer av värdepapper. Varje sida bygger på en faktisk StockBox-rapport och visar bara datapunkter som fanns i den publicerade analysen."
        breadcrumbs={breadcrumbs}
      />
      <Section className="py-10">
        <Container className="max-w-5xl">
          <div className="mb-8 max-w-3xl">
            <h2 className="serif text-3xl font-semibold text-[#f4efe5]">Analys utan påhittade luckor</h2>
            <p className="mt-3 text-sm leading-7 text-[#9aa7b8]">StockBox publicerar inte automatiskt användares rapporter. En publik snapshot måste vara explicit publicerad och klara krav på datatäckning, konfidens och aktualitet.</p>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm"><Link href="/nyckeltal" className="font-semibold text-[#e1cb95] hover:text-white">Nyckeltalsguider</Link><Link href="/fundamental-analys" className="font-semibold text-[#e1cb95] hover:text-white">Fundamental analys</Link><Link href="/docs/methodology" className="font-semibold text-[#e1cb95] hover:text-white">Metodik</Link></div>
          </div>
          {snapshots.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {snapshots.map((snapshot) => (
                <Link key={snapshot.slug} href={`/aktier/${snapshot.slug}`} className="group">
                  <Card className="h-full transition group-hover:border-[#e1cb95]/35">
                    <div className="flex items-start justify-between gap-4">
                      <div><p className="font-mono text-xs text-[#e1cb95]">{snapshot.ticker}</p><h2 className="mt-1 text-xl font-semibold text-[#f4efe5]">{snapshot.companyName}</h2></div>
                      {snapshot.score !== null ? <span className="number rounded-full border border-[#e1cb95]/30 px-3 py-1 text-sm font-semibold text-[#e1cb95]">{Math.round(snapshot.score)}/100</span> : null}
                    </div>
                    <p className="mt-4 text-sm leading-6 text-[#9aa7b8]">{snapshot.metaDescription}</p>
                    <p className="mt-4 text-xs font-semibold text-[#e1cb95]">Öppna analysen →</p>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <Card><p className="text-sm leading-7 text-[#c9d2df]">De första publika analyssnapshotsen publiceras efter StockBox kvalitetsspärr. Under tiden kan du köra en egen analys direkt från startsidan.</p></Card>
          )}

          {totalPages > 1 ? (
            <nav aria-label="Paginering" className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-6 text-sm">
              <div>
                {pageNumber > 1 ? <Link href={pageNumber > 2 ? `/aktier?page=${pageNumber - 1}` : "/aktier"} className="font-semibold text-[#e1cb95] hover:text-white">← Föregående sida</Link> : null}
              </div>
              <p className="text-xs text-[#9aa7b8]">Sida {pageNumber} av {totalPages} · {totalCount} publika analyser</p>
              <div>
                {pageNumber < totalPages ? <Link href={`/aktier?page=${pageNumber + 1}`} className="font-semibold text-[#e1cb95] hover:text-white">Nästa sida →</Link> : null}
              </div>
            </nav>
          ) : null}
        </Container>
      </Section>
    </>
  );
}
