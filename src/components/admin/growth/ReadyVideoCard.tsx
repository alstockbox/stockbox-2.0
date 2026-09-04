import { CopyButton } from "@/components/admin/copy-button";
import type { GrowthReadyVideo } from "@/lib/growth/admin-growth-data";
import { setDistributionPackageStatusAction } from "@/app/admin/growth/actions";

function platformLabel(platform: string) {
  const labels: Record<string, string> = {
    instagram_reel: "Instagram",
    facebook_reel: "Facebook",
    tiktok: "TikTok",
    youtube_short: "YouTube Shorts",
  };
  return labels[platform] || platform;
}

function packageCopy(pkg: GrowthReadyVideo["packages"][number]) {
  const lines = [pkg.title, pkg.description || pkg.caption, pkg.utmUrl].filter(Boolean);
  return lines.join("\n\n");
}

export function ReadyVideoCard({ video, index }: { video: GrowthReadyVideo; index: number }) {
  return (
    <article className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.035] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#b99b5f]/15 px-2 py-1 text-[11px] font-semibold text-[#d6ba7a]">#{index + 1} READY</span>
            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[11px] font-semibold text-emerald-200">Färdig MP4</span>
          </div>
          <h3 className="mt-3 text-lg font-semibold">{video.title}</h3>
          {video.topic ? <p className="mt-1 text-sm text-[#9aa7b8]">{video.topic}</p> : null}
        </div>
        <span className="text-xs uppercase tracking-[0.12em] text-[#7f8ea2]">{video.language} · {video.template}</span>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-black/30">
        <video
          controls
          preload="metadata"
          className="mx-auto aspect-[9/16] max-h-[620px] w-auto max-w-full bg-black"
          src={`/api/admin/growth/assets/${video.masterAssetId}`}
        >
          Din webbläsare kan inte spela videon.
        </video>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={`/api/admin/growth/assets/${video.masterAssetId}?download=1`}
          className="rounded-md bg-[#b99b5f] px-3 py-2 text-xs font-semibold text-[#07111f]"
        >
          Ladda ner MP4
        </a>
        {video.coverAssetId ? (
          <a
            href={`/api/admin/growth/assets/${video.coverAssetId}?download=1`}
            className="rounded-md border border-white/15 px-3 py-2 text-xs font-semibold hover:bg-white/5"
          >
            Ladda ner cover
          </a>
        ) : null}
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {video.packages.map((pkg) => (
          <div key={pkg.id} className="rounded-lg border border-white/10 bg-black/15 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">{platformLabel(pkg.platform)}</p>
              <CopyButton text={packageCopy(pkg)} label={`Kopiera ${platformLabel(pkg.platform)}`} />
            </div>
            {pkg.caption || pkg.description ? (
              <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-xs leading-5 text-[#aeb9c8]">{pkg.description || pkg.caption}</p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {pkg.recommendedTime ? <span className="text-[11px] text-[#7f8ea2]">Rek. tid: {pkg.recommendedTime}</span> : null}
              <form action={setDistributionPackageStatusAction}>
                <input type="hidden" name="id" value={pkg.id} />
                <input type="hidden" name="status" value="posted" />
                <button className="rounded-md border border-emerald-400/25 px-2 py-1 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-400/10">Publicerad ✓</button>
              </form>
              <form action={setDistributionPackageStatusAction}>
                <input type="hidden" name="id" value={pkg.id} />
                <input type="hidden" name="status" value="deferred" />
                <button className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-[#9aa7b8] hover:bg-white/5">Hoppa över</button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}
