import { CopyButton } from "@/components/admin/copy-button";
import type { GrowthReadyAsset } from "@/lib/growth/admin-growth-data";
import { setDistributionPackageStatusAction } from "@/app/admin/growth/actions";

function packageCopy(pkg: GrowthReadyAsset["packages"][number]) {
  return [pkg.title, pkg.description || pkg.caption, pkg.utmUrl].filter(Boolean).join("\n\n");
}

export function ReadyAssetCard({ asset }: { asset: GrowthReadyAsset }) {
  const isImage = asset.kind === "static_image";
  return (
    <article className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#b99b5f]">{asset.kind === "carousel_zip" ? "Carousel" : "Bild"}</p>
          <h3 className="mt-2 font-semibold">{asset.title}</h3>
        </div>
        <a
          href={`/api/admin/growth/assets/${asset.assetId}?download=1`}
          className="rounded-md border border-[#b99b5f]/50 px-3 py-2 text-xs font-semibold text-[#d7bd84] hover:bg-[#b99b5f]/10"
        >
          {asset.kind === "carousel_zip" ? "Ladda ner ZIP" : "Ladda ner bild"}
        </a>
      </div>

      {isImage ? (
        <img
          src={`/api/admin/growth/assets/${asset.assetId}`}
          alt="Färdig StockBox-bild"
          className="mt-4 max-h-[520px] w-full rounded-lg border border-white/10 object-contain"
        />
      ) : null}

      <div className="mt-4 space-y-2">
        {asset.packages.map((pkg) => (
          <div key={pkg.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 p-3">
            <span className="text-xs font-semibold">{pkg.platform}</span>
            <div className="flex flex-wrap gap-2">
              <CopyButton text={packageCopy(pkg)} label="Kopiera text" />
              <form action={setDistributionPackageStatusAction}>
                <input type="hidden" name="id" value={pkg.id} />
                <input type="hidden" name="status" value="posted" />
                <button className="min-h-9 rounded-md border border-emerald-400/25 px-3 text-xs font-semibold text-emerald-200">Publicerad ✓</button>
              </form>
              <form action={setDistributionPackageStatusAction}>
                <input type="hidden" name="id" value={pkg.id} />
                <input type="hidden" name="status" value="deferred" />
                <button className="min-h-9 rounded-md border border-white/15 px-3 text-xs font-semibold">Hoppa över</button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}
