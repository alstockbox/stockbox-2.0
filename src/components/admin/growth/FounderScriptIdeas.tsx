import { CopyButton } from "@/components/admin/copy-button";
import type { GrowthFounderScript } from "@/lib/growth/admin-growth-data";

export function FounderScriptIdeas({ scripts }: { scripts: GrowthFounderScript[] }) {
  return (
    <section className="mt-10 rounded-xl border border-[#b99b5f]/25 bg-[#b99b5f]/[0.04] p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b99b5f]">Bonus — helt frivilligt</p>
        <h2 className="mt-2 text-xl font-semibold">Om du själv vill spela in idag</h2>
        <p className="mt-2 text-sm leading-6 text-[#9aa7b8]">De här manusen är extra idéer. Den automatiska contentmotorn fungerar även om du inte använder dem.</p>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {scripts.map((item, index) => (
          <article key={item.id} className="rounded-xl border border-white/10 bg-black/15 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-[#b99b5f]">Idé #{index + 1}</p>
                <h3 className="mt-2 font-semibold">{item.hook}</h3>
              </div>
              <CopyButton text={item.script} label="Kopiera manus" />
            </div>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-[#c7d0dc]">{item.script}</p>
            {item.screenDirections ? <p className="mt-3 text-xs leading-5 text-[#8f9caf]">Förslag på bild: {item.screenDirections}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[#7f8ea2]">
              {item.recommendedPlatform ? <span>{item.recommendedPlatform}</span> : null}
              {item.cta ? <span>CTA: {item.cta}</span> : null}
            </div>
          </article>
        ))}
        {scripts.length === 0 ? (
          <p className="text-sm text-[#9aa7b8]">Inga frivilliga manus har skapats för idag ännu.</p>
        ) : null}
      </div>
    </section>
  );
}
