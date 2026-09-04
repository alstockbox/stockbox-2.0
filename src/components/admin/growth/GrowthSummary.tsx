import type { GrowthAdminViewModel } from "@/lib/growth/admin-growth-data";

function display(value: number | null, suffix = "") {
  return value === null ? "—" : `${value}${suffix}`;
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7f8ea2]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[#f4efe5]">{value}</p>
      {detail ? <p className="mt-1 text-xs text-[#9aa7b8]">{detail}</p> : null}
    </div>
  );
}

export function GrowthSummary({ summary }: { summary: GrowthAdminViewModel["summary"] }) {
  const change = summary.changePct === null
    ? "Ingen jämförbar föregående period ännu"
    : `${summary.changePct >= 0 ? "+" : ""}${summary.changePct}% mot föregående period`;

  return (
    <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <Stat label="Besök idag" value={display(summary.qualifiedVisitorsToday)} />
      <Stat label="7-dagarssnitt" value={display(summary.rolling7d, "/dag")} detail={change} />
      <Stat label="Mål" value={`${summary.targetDailyVisitors}/dag`} />
      <Stat label="Budget" value={`${summary.monthlySpendSek} / ${summary.budgetTargetSek} kr`} detail={`Absolut tak ${summary.budgetHardCapSek} kr`} />
      <Stat label="Föregående period" value={display(summary.previous7d, "/dag")} />
    </section>
  );
}
