import type { Metadata } from "next";
import Link from "next/link";
import { CopyButton } from "@/components/admin/copy-button";
import { requireAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { runGrowthEngineAction, setDistributionStatusAction, setOutreachStatusAction } from "./actions";

export const metadata: Metadata = { title: "Growth Control Center" };

export default async function GrowthAdminPage() {
  await requireAdmin();
  const supabase = createAdminClient();
  if (!supabase) return <main className="mx-auto max-w-5xl px-6 py-12 text-[#f4efe5]">Supabase saknas.</main>;

  const [briefResult, queueResult, outreachResult, seoResult, metricsResult, errorResult] = await Promise.all([
    supabase.from("acq_founder_briefs").select("brief_date,summary,payload,created_at").order("brief_date", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("acq_distribution_queue").select("id,content_id,platform,caption,script,media_instructions,cta,utm_url,recommended_time,status,created_at").eq("status", "pending_approval").order("created_at", { ascending: true }).limit(24),
    supabase.from("acq_creator_outreach").select("id,creator_id,channel,message,offer,status,created_at").eq("status", "queued").order("created_at", { ascending: true }).limit(20),
    supabase.from("acq_seo_pages").select("slug,title,keyword,status,published_at").eq("status", "published").order("published_at", { ascending: false }).limit(12),
    supabase.from("acq_daily_metrics").select("metric_date,qualified_unique_visitors,rolling_7d_avg,returning_visitors,attribution_rate,by_source").order("metric_date", { ascending: false }).limit(7),
    supabase.from("acq_errors").select("source,error_type,message,occurred_at").order("occurred_at", { ascending: false }).limit(8),
  ]);

  const queue = queueResult.data ?? [];
  const contentIds = [...new Set(queue.map((row) => row.content_id).filter(Boolean))] as string[];
  const contentResult = contentIds.length
    ? await supabase.from("acq_content").select("id,title,topic,company").in("id", contentIds)
    : { data: [] };
  const contentById = new Map((contentResult.data ?? []).map((row) => [row.id, row] as const));

  const outreach = outreachResult.data ?? [];
  const creatorIds = [...new Set(outreach.map((row) => row.creator_id).filter(Boolean))] as string[];
  const creatorResult = creatorIds.length
    ? await supabase.from("acq_creators").select("id,name,platform,profile_url,creator_score").in("id", creatorIds)
    : { data: [] };
  const creatorById = new Map((creatorResult.data ?? []).map((row) => [row.id, row] as const));

  const brief = briefResult.data;
  const latestMetric = metricsResult.data?.[0];
  const target = Number((brief?.payload as Record<string, unknown> | null)?.target ?? 100);
  const rolling = Number(latestMetric?.rolling_7d_avg ?? 0);

  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-10 text-[#f4efe5] sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#b99b5f]">StockBox Traffic Machine</p>
          <h1 className="mt-2 text-3xl font-semibold">Growth Control Center</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#9aa7b8]">Här finns det du faktiskt behöver göra. Motorn hittar, prioriterar, skapar och mäter automatiskt.</p>
        </div>
        <form action={runGrowthEngineAction}>
          <input type="hidden" name="mode" value="full" />
          <button className="min-h-11 rounded-md bg-[#b99b5f] px-4 text-sm font-semibold text-[#07111f] hover:bg-[#d0b579]">Kör hela motorn nu</button>
        </form>
      </div>

      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        <Stat label="7-dagarssnitt" value={`${rolling}/dag`} />
        <Stat label="Mål" value={`${target}/dag`} />
        <Stat label="Content att posta" value={String(queue.length)} />
      </section>

      <section className="mt-8 rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Morgonrapport</h2>
          <form action={runGrowthEngineAction}>
            <input type="hidden" name="mode" value="brief" />
            <button className="rounded-md border border-white/15 px-3 py-2 text-xs font-semibold hover:bg-white/5">Uppdatera</button>
          </form>
        </div>
        <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-6 text-[#c7d0dc]">{brief?.summary ?? "Ingen rapport ännu. Klicka på Kör hela motorn nu."}</pre>
      </section>

      <section className="mt-8">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">1. Content redo att publicera</h2>
            <p className="mt-1 text-sm text-[#9aa7b8]">Kopiera, publicera på plattformen och markera sedan som postad.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {queue.map((row) => {
            const content = row.content_id ? contentById.get(row.content_id) : null;
            const postText = [row.caption, row.script ? `\n\nMANUS:\n${row.script}` : "", row.utm_url ? `\n\nLÄNK:\n${row.utm_url}` : ""].filter(Boolean).join("");
            return (
              <article key={row.id} className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#b99b5f]">{row.platform}</p>
                    <h3 className="mt-1 font-semibold">{content?.title ?? content?.topic ?? "StockBox content"}</h3>
                  </div>
                  <CopyButton text={postText} label="Kopiera allt" />
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#c7d0dc]">{row.caption}</p>
                {row.media_instructions ? <p className="mt-3 rounded-md bg-black/20 p-3 text-xs leading-5 text-[#9aa7b8]"><strong>Bild/video:</strong> {row.media_instructions}</p> : null}
                {row.recommended_time ? <p className="mt-2 text-xs text-[#9aa7b8]">Rekommenderad tid: {row.recommended_time}</p> : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <form action={setDistributionStatusAction}>
                    <input type="hidden" name="id" value={row.id} />
                    <input type="hidden" name="status" value="posted" />
                    <button className="rounded-md bg-[#b99b5f] px-3 py-2 text-xs font-semibold text-[#07111f]">Jag har postat ✓</button>
                  </form>
                  <form action={setDistributionStatusAction}>
                    <input type="hidden" name="id" value={row.id} />
                    <input type="hidden" name="status" value="deferred" />
                    <button className="rounded-md border border-white/15 px-3 py-2 text-xs font-semibold hover:bg-white/5">Hoppa över</button>
                  </form>
                </div>
              </article>
            );
          })}
          {queue.length === 0 ? <p className="text-sm text-[#9aa7b8]">Ingen väntande content. Kör motorn för att skapa nytt.</p> : null}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">2. Creator-samarbeten</h2>
        <p className="mt-1 text-sm text-[#9aa7b8]">Inget skickas automatiskt. Du godkänner själv.</p>
        <div className="mt-4 space-y-3">
          {outreach.map((row) => {
            const creator = row.creator_id ? creatorById.get(row.creator_id) : null;
            return (
              <article key={row.id} className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                <div className="flex flex-wrap justify-between gap-3">
                  <div>
                    <p className="font-semibold">{creator?.name ?? "Creator"} <span className="text-xs font-normal text-[#9aa7b8]">{creator?.creator_score ? `score ${creator.creator_score}` : ""}</span></p>
                    {creator?.profile_url ? <a href={creator.profile_url} target="_blank" rel="noreferrer" className="text-xs text-[#b99b5f] underline">Öppna profil</a> : null}
                  </div>
                  <CopyButton text={row.message ?? ""} label="Kopiera meddelande" />
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#c7d0dc]">{row.message}</p>
                <div className="mt-3 flex gap-2">
                  <form action={setOutreachStatusAction}>
                    <input type="hidden" name="id" value={row.id} />
                    <input type="hidden" name="status" value="sent" />
                    <button className="rounded-md bg-[#b99b5f] px-3 py-2 text-xs font-semibold text-[#07111f]">Jag har skickat ✓</button>
                  </form>
                  <form action={setOutreachStatusAction}>
                    <input type="hidden" name="id" value={row.id} />
                    <input type="hidden" name="status" value="rejected" />
                    <button className="rounded-md border border-white/15 px-3 py-2 text-xs font-semibold hover:bg-white/5">Skippa</button>
                  </form>
                </div>
              </article>
            );
          })}
          {outreach.length === 0 ? <p className="text-sm text-[#9aa7b8]">Inga creator-meddelanden väntar.</p> : null}
        </div>
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.025] p-5">
          <h2 className="text-lg font-semibold">SEO-sidor som redan är live</h2>
          <div className="mt-4 space-y-2">
            {(seoResult.data ?? []).map((page) => (
              <Link key={page.slug} href={`/learn/${page.slug}`} target="_blank" className="block rounded-md border border-white/10 p-3 text-sm hover:bg-white/5">
                {page.title}
              </Link>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.025] p-5">
          <h2 className="text-lg font-semibold">Senaste systemfel</h2>
          <div className="mt-4 space-y-2 text-xs text-[#9aa7b8]">
            {(errorResult.data ?? []).map((error, index) => <p key={`${error.occurred_at}-${index}`}><strong>{error.source}</strong>: {error.message}</p>)}
            {(errorResult.data ?? []).length === 0 ? <p>Inga loggade fel.</p> : null}
          </div>
        </div>
      </section>

      <p className="mt-10 text-xs text-[#708095]">Motorn är schemalagd i Supabase och körs automatiskt varje dag. Den här sidan är din manuella kontrollstation.</p>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5"><p className="text-xs uppercase tracking-wide text-[#9aa7b8]">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>;
}
