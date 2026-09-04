import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

async function getPage(slug: string) {
  const supabase = createAdminClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("acq_seo_pages")
    .select("slug,keyword,title,body,meta_description,published_at")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (error) return null;
  return data;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPage(slug);
  if (!page) return {};
  const title = page.title || `${page.keyword} | StockBox`;
  const description = page.meta_description || `Lär dig mer om ${page.keyword} och hur du kan strukturera din aktieanalys med StockBox.`;
  return {
    title,
    description,
    alternates: { canonical: `/learn/${page.slug}` },
    openGraph: { title, description, type: "article" },
  };
}

export default async function LearnPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getPage(slug);
  if (!page || !page.body) notFound();

  const paragraphs = String(page.body).split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.getstockbox.app";
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: page.title,
    description: page.meta_description,
    datePublished: page.published_at,
    mainEntityOfPage: `${baseUrl}/learn/${page.slug}`,
    publisher: { "@type": "Organization", name: "StockBox", url: baseUrl },
  };

  return (
    <article className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#b99b5f]">StockBox guide</p>
      <h1 className="mt-3 text-3xl font-semibold leading-tight text-[#f4efe5] sm:text-4xl">{page.title}</h1>
      <p className="mt-4 text-sm leading-6 text-[#9aa7b8]">
        Utbildande material – inte personlig investeringsrådgivning. Kontrollera alltid aktuella bolagsuppgifter och bedöm risk själv.
      </p>

      <div className="mt-9 space-y-5 text-[15px] leading-7 text-[#d6dde7]">
        {paragraphs.map((paragraph, index) => <p key={`${page.slug}-${index}`}>{paragraph}</p>)}
      </div>

      <div className="mt-10 rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="text-lg font-semibold text-[#f4efe5]">Gör analysen snabbare i StockBox</h2>
        <p className="mt-2 text-sm leading-6 text-[#9aa7b8]">
          StockBox samlar flera delar av bolagsanalysen på ett ställe så att du kan gå från fråga till strukturerad överblick snabbare.
        </p>
        <Link href="/analyze" className="mt-4 inline-flex min-h-11 items-center rounded-md bg-[#b99b5f] px-4 text-sm font-semibold text-[#07111f] hover:bg-[#d0b579]">
          Testa StockBox
        </Link>
      </div>
    </article>
  );
}
