import type { GrowthAdminViewModel } from "@/lib/growth/admin-growth-data";

export function GrowthLearningBrief({ brief }: { brief: GrowthAdminViewModel["learningBrief"] }) {
  return (
    <section className="mt-8 rounded-xl border border-sky-400/20 bg-sky-400/[0.035] p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-200">Vad motorn lär sig</p>
      <p className="mt-3 text-sm leading-6 text-[#d7e0eb]">
        {brief.text ?? "Ingen attribuerad contenttrafik ännu. Motorn fortsätter samla data och behåller bred exploration."}
      </p>
      {(brief.sample !== null || brief.confidence !== null) ? (
        <p className="mt-2 text-xs text-[#8fa0b4]">
          {brief.sample !== null ? `Sample: ${brief.sample}` : ""}
          {brief.sample !== null && brief.confidence !== null ? " · " : ""}
          {brief.confidence !== null ? `Konfidens: ${Math.round(brief.confidence * 100)}%` : ""}
        </p>
      ) : null}
    </section>
  );
}
