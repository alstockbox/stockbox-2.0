import type { Metadata } from "next";
import { CopyButton } from "@/components/admin/copy-button";
import { FounderScriptIdeas } from "@/components/admin/growth/FounderScriptIdeas";
import { GrowthDiagnostics } from "@/components/admin/growth/GrowthDiagnostics";
import { GrowthLearningBrief } from "@/components/admin/growth/GrowthLearningBrief";
import { GrowthSummary } from "@/components/admin/growth/GrowthSummary";
import { ReadyAssetCard } from "@/components/admin/growth/ReadyAssetCard";
import { ReadyVideoCard } from "@/components/admin/growth/ReadyVideoCard";
import { requireAdmin } from "@/lib/auth/session";
import {
  createSupabaseGrowthAdminDataSource,
  loadGrowthAdminData,
} from "@/lib/growth/admin-growth-data";
import { buildPublishingPackage } from "@/lib/growth/publishing-package";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  runGrowthEngineAction,
  setDistributionStatusAction,
  setOutreachStatusAction,
} from "./actions";

export const metadata: Metadata = { title: "Growth Control Center" };

export default async function GrowthAdminPage() {
  await requireAdmin();
  const supabase = createAdminClient();
  if (!supabase) {
    return <main className="mx-auto max-w-5xl px-6 py-12 text-[#f4efe5]">Supabase saknas.</main>;
  }

  const [view, legacyQueueResult, outreachResult, seoResult] = await Promise.all([
    loadGrowthAdminData(createSupabaseGrowthAdminDataSource(supabase)),
    supabase
      .from("acq_distribution_queue")
      .select("id,content_id,platform,caption,script,media_instructions,utm_url,recommended_time,status,quality_score,daily_rank,generation_version")
      .eq("status", "pending_approval")
      .eq("generation_version", "v2")
      .gte("quality_score", 72)
      .order("daily_rank", { ascending: true, nullsFirst: false })
      .limit(6),
    supabase
      .from("acq_creator_outreach")
      .select("id,creator_id,channel,message,offer,status,created_at")
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(12),
    supabase
      .from("acq_seo_pages")
      .select("slug,title,keyword,status,published_at")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(8),
  ]);

  const legacyQueue = legacyQueueResult.data ?? [];
  const legacyContentIds = [...new Set(legacyQueue.map((row) => row.content_id).filter(Boolean))] as string[];
  const legacyContentResult = legacyContentIds.length
    ? await supabase.from("acq_content").select("id,title,topic").in("id", legacyContentIds)
    : { data: [] };
  const legacyContentById = new Map((legacyContentResult.data ?? []).map((row) => [row.id, row] as const));

  const outreach = outreachResult.data ?? [];
  const creatorIds = [...new Set(outreach.map((row) => row.creator_id).filter(Boolean))] as string[];
  const creatorResult = creatorIds.length
    ? await supabase.from("acq_creators").select("id,name,platform,profile_url,creator_score").in("id", creatorIds)
    : { data: [] };
  const creatorById = new Map((creatorResult.data ?? []).map((row) => [row.id, row] as const));

  const hasV3Ready = view.readyVideos.length > 0 || view.readyAssets.length > 0;

  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-10 text-[#f4efe5] sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#b99b5f]">StockBox Growth</p>
          <h1 className="mt-2 text-3xl font-semibold">Growth Control Center</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#9aa7b8]">
            När v3-material är READY är video, ljud, subtitles, cover och plattformstext redan färdiga. Ditt normala arbete ska bara vara att ladda ner och publicera.
          </p>
        </div>
        <form action={runGrowthEngineAction}>
          <input type="hidden" name="mode" value="full" />
          <button className="min-h-11 rounded-md bg-[#b99b5f] px-4 text-sm font-semibold text-[#07111f] hover:bg-[#d0b579]">
            Kör ordinarie growth-loop nu
          </button>
        </form>
      </div>

      <GrowthSummary summary={view.summary} />
      <GrowthLearningBrief brief={view.learningBrief} />

      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-200">Automatiskt material</p>
            <h2 className="mt-2 text-2xl font-semibold">READY att publicera</h2>
            <p className="mt-2 max-w-3xl text-sm text-[#9aa7b8]">Här visas bara v3-material som passerat QC och har färdiga distributionspaket. Inga video-kit eller redigeringsinstruktioner räknas som READY.</p>
          </div>
          <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-[#9aa7b8]">{view.readyVideos.length} video · {view.readyAssets.length} bild/carousel</span>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          {view.readyVideos.map((video, index) => (
            <ReadyVideoCard key={video.renderJobId} video={video} index={index} />
          ))}
        </div>

        {view.readyAssets.length > 0 ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {view.readyAssets.map((asset) => <ReadyAssetCard key={asset.assetId} asset={asset} />)}
          </div>
        ) : null}

        {!hasV3Ready ? (
          <div className="mt-5 rounded-xl border border-sky-400/20 bg-sky-400/[0.035] p-5 text-sm leading-6 text-[#c7d0dc]">
            <strong className="text-[#f4efe5]">v3 kör fortfarande säkert i shadow-läge.</strong> Det betyder att ofärdigt eller ännu inte verifierat material inte visas som READY. Legacy v2 ligger kvar som fallback längre ned tills produktionscanary är godkänd.
          </div>
        ) : null}
      </section>

      <FounderScriptIdeas scripts={view.founderScripts} />
      <GrowthDiagnostics diagnostics={view.diagnosticsSummary} />

      <section className="mt-10 rounded-xl border border-white/10 bg-white/[0.02] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7f8ea2]">Fallback under utrullningen</p>
            <h2 className="mt-2 text-xl font-semibold">Legacy v2 content</h2>
            <p className="mt-1 text-sm text-[#9aa7b8]">Den gamla kön tas inte bort förrän v3 är verifierad i produktion. Den här sektionen är därför backup, inte det framtida huvudflödet.</p>
          </div>
          <span className="text-xs text-[#7f8ea2]">{view.legacyV2Count} väntar</span>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {legacyQueue.map((row) => {
            const content = row.content_id ? legacyContentById.get(row.content_id) : null;
            const title = content?.title ?? content?.topic ?? "StockBox content";
            const packageText = buildPublishingPackage({
              platform: row.platform,
              title,
              caption: row.caption,
              script: row.script,
              mediaInstructions: row.media_instructions,
              utmUrl: row.utm_url,
            });
            return (
              <article key={row.id} className="rounded-xl border border-white/10 bg-black/15 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.12em] text-[#7f8ea2]">{row.platform} · kvalitet {Number(row.quality_score ?? 0)}/100</p>
                    <h3 className="mt-2 font-semibold">{title}</h3>
                  </div>
                  <CopyButton text={packageText} label="Kopiera v2-paket" />
                </div>
                <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-[#aeb9c8]">{row.caption}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <form action={setDistributionStatusAction}>
                    <input type="hidden" name="id" value={row.id} />
                    <input type="hidden" name="status" value="posted" />
                    <button className="rounded-md border border-white/15 px-3 py-2 text-xs font-semibold">Publicerad ✓</button>
                  </form>
                  <form action={setDistributionStatusAction}>
                    <input type="hidden" name="id" value={row.id} />
                    <input type="hidden" name="status" value="deferred" />
                    <button className="rounded-md border border-white/10 px-3 py-2 text-xs text-[#9aa7b8]">Hoppa över</button>
                  </form>
                  {row.recommended_time ? <span className="self-center text-xs text-[#7f8ea2]">Rek. {row.recommended_time}</span> : null}
                </div>
              </article>
            );
          })}
          {legacyQueue.length === 0 ? <p className="text-sm text-[#9aa7b8]">Ingen legacy-post väntar.</p> : null}
        </div>
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.025] p-5">
          <h2 className="text-lg font-semibold">Creator-samarbeten</h2>
          <p className="mt-1 text-sm text-[#9aa7b8]">Utskicken är fortfarande manuellt godkända för att undvika spam.</p>
          <div className="mt-4 space-y-3">
            {outreach.map((row) => {
              const creator = row.creator_id ? creatorById.get(row.creator_id) : null;
              return (
                <article key={row.id} className="rounded-lg border border-white/10 bg-black/15 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">{creator?.name ?? "Creator"}</p>
                      {creator?.profile_url ? <a className="text-xs text-[#b99b5f] underline" href={creator.profile_url} target="_blank" rel="noreferrer">Öppna profil</a> : null}
                    </div>
                    <CopyButton text={row.message ?? ""} label="Kopiera meddelande" />
                  </div>
                  <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-xs leading-5 text-[#aeb9c8]">{row.message}</p>
                  <div className="mt-3 flex gap-2">
                    <form action={setOutreachStatusAction}>
                      <input type="hidden" name="id" value={row.id} />
                      <input type="hidden" name="status" value="sent" />
                      <button className="rounded-md border border-emerald-400/20 px-2 py-1 text-[11px] text-emerald-200">Skickat ✓</button>
                    </form>
                    <form action={setOutreachStatusAction}>
                      <input type="hidden" name="id" value={row.id} />
                      <input type="hidden" name="status" value="rejected" />
                      <button className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-[#9aa7b8]">Skippa</button>
                    </form>
                  </div>
                </article>
              );
            })}
            {outreach.length === 0 ? <p className="text-sm text-[#9aa7b8]">Inga creator-meddelanden väntar.</p> : null}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.025] p-5">
          <h2 className="text-lg font-semibold">SEO som redan är publicerat</h2>
          <p className="mt-1 text-sm text-[#9aa7b8]">SEO-flödet fortsätter parallellt med videofabriken.</p>
          <div className="mt-4 space-y-2">
            {(seoResult.data ?? []).map((page) => (
              <div key={page.slug} className="rounded-lg border border-white/10 bg-black/15 p-3">
                <p className="text-sm font-semibold">{page.title}</p>
                <p className="mt-1 text-xs text-[#7f8ea2]">{page.keyword}</p>
              </div>
            ))}
            {(seoResult.data ?? []).length === 0 ? <p className="text-sm text-[#9aa7b8]">Inga publicerade SEO-sidor ännu.</p> : null}
          </div>
        </div>
      </section>
    </main>
  );
}
