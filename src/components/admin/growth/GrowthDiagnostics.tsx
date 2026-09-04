import type { GrowthAdminViewModel } from "@/lib/growth/admin-growth-data";

export function GrowthDiagnostics({ diagnostics }: { diagnostics: GrowthAdminViewModel["diagnosticsSummary"] }) {
  const actionRequired = diagnostics.actionRequired > 0;
  return (
    <section className={`mt-8 rounded-xl border p-5 ${actionRequired ? "border-rose-400/30 bg-rose-400/[0.04]" : "border-white/10 bg-white/[0.025]"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Systemstatus</h2>
          <p className="mt-1 text-sm text-[#9aa7b8]">
            {actionRequired
              ? `${diagnostics.actionRequired} steg behöver åtgärdas.`
              : "Motorn har inget känt fel som kräver din åtgärd."}
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-emerald-200">Friska {diagnostics.healthy}</span>
          <span className="rounded-full bg-amber-400/10 px-2 py-1 text-amber-200">Fallback {diagnostics.recovered}</span>
          <span className="rounded-full bg-rose-400/10 px-2 py-1 text-rose-200">Åtgärd {diagnostics.actionRequired}</span>
        </div>
      </div>

      <details className="mt-4 rounded-lg border border-white/10 bg-black/15 p-3">
        <summary className="cursor-pointer text-xs font-semibold text-[#aeb9c8]">Visa teknisk diagnostik</summary>
        <div className="mt-3 space-y-2">
          {diagnostics.items.map((item, index) => (
            <div key={`${item.workflow}-${index}`} className="rounded-md border border-white/10 p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-[#f4efe5]">{item.workflow}</span>
                <span className="text-[#9aa7b8]">{item.state}</span>
              </div>
              <p className="mt-2 text-[#c7d0dc]">{item.founderMessage}</p>
              <p className="mt-1 font-mono text-[10px] text-[#6f7f94]">{item.technicalSummary}</p>
            </div>
          ))}
          {diagnostics.items.length === 0 ? <p className="text-xs text-[#9aa7b8]">Ingen diagnostik registrerad senaste dygnet.</p> : null}
        </div>
      </details>
    </section>
  );
}
