import type { Metadata } from "next";
import Link from "next/link";
import { Card, Container, Section } from "@/components/ui/card";
import { SeoHero, SeoJsonLd, breadcrumbJsonLd } from "@/components/seo/seo-shell";
import { listPublicStockSnapshots } from "@/lib/seo/public-snapshots";

export const metadata: Metadata = {
  title: "Aktier – publika aktieanalyser och StockBox Score",
  description: "Utforska publika StockBox-analyser av svenska och internationella aktier med score, värdering, tillväxt, lönsamhet, risk och synliga datakällor.",
  alternates: { canonical: "/aktier" },
};
export const dynamic = "force-dynamic";

export default async function StocksPage() {
  const snapshots = await listPublicStockSnapshots(100);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.getstockbox.app";
  const breadcrumbs = [{ label: "StockBox", href: "/" }, { label: "Aktier", href: "/aktier" }];
  const pageUrl = new URL("/aktier", baseUrl).toString();
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      breadcrumbJsonLd(baseUrl, breadcrumbs),
      {
        "@type": "CollectionPage",
        "@id": `${pageUrl}#collection`,
        url: pageUrl,
        name: "Publika StockBox aktieanalyser",
        description: metadata.description,
        publisher: { "@id": `${baseUrl.replace(/\/$/, "")}/#organization` },
        mainEntity: {
          "@type": "ItemList",
          itemListElement: snapshots.map((snapshot, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: `${snapshot.companyName} aktieanalys`,
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
        eyebrow="Aktieanalyser"
        title="Publika aktieanalyser med StockBox Score"
        lead="Här samlar StockBox kvalitetssäkrade, publika analyssnapshots. Varje sida bygger på en faktisk StockBox-rapport och visar bara finansiella datapunkter som fanns i den publicerade analysen."
        breadcrumbs={breadcrumbs}
      />
      <Section className="py-10">
        <Container className="max-w-5xl">
          <div className="mb-8 max-w-3xl">
            <h2 className="serif text-3xl font-semibold text-[#f4efe5]">Aktieanalys utan påhittade luckor</h2>
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
                    <p className="mt-4 text-xs font-semibold text-[#e1cb95]">Öppna aktieanalysen →</p>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <Card><p className="text-sm leading-7 text-[#c9d2df]">De första publika bolagssnapshotsen publiceras efter StockBox kvalitetsspärr. Under tiden kan du köra en egen analys direkt från startsidan.</p></Card>
          )}
        </Container>
      </Section>
    </>
  );
}
