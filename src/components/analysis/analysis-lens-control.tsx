"use client";

import { RotateCcw } from "lucide-react";
import { ANALYSIS_LENS_PROFILES } from "@/lib/analysis/analysis-lens";
import { profilePresentationFor } from "@/lib/analysis/profile-presentation";
import type { InvestmentProfile } from "@/lib/analysis/types";
import type { Locale } from "@/lib/i18n/types";
import { Card } from "@/components/ui/card";

const LABELS: Record<InvestmentProfile, { en: string; sv: string }> = {
  balanced: { en: "Balanced", sv: "Balanserad" },
  long_term: { en: "Long term", sv: "Lång sikt" },
  short_term: { en: "Short term", sv: "Kort sikt" },
  growth: { en: "Growth", sv: "Tillväxt" },
  value: { en: "Value", sv: "Värde" },
  quality: { en: "Quality", sv: "Kvalitet" },
  dividend: { en: "Dividend", sv: "Utdelning" },
  defensive: { en: "Defensive", sv: "Defensiv" },
};

function profileLabel(profile: InvestmentProfile, locale: Locale) {
  return locale === "sv" ? LABELS[profile].sv : LABELS[profile].en;
}

export function AnalysisLensControl({
  value,
  defaultProfile,
  lensScore,
  locale,
  onChange,
}: {
  value: InvestmentProfile;
  defaultProfile: InvestmentProfile;
  lensScore: number | null;
  locale: Locale;
  onChange: (profile: InvestmentProfile) => void;
}) {
  const presentation = profilePresentationFor(value, locale);
  const changed = value !== defaultProfile;
  const copy = locale === "sv"
    ? {
        eyebrow: "Tillfälligt investeringsperspektiv",
        title: "Testa aktien genom en annan lins",
        subtitle: "Tillfällig vy — ändrar inte din standardprofil, sparar inga profilinställningar, använder ingen analyskvot och hämtar ingen ny marknadsdata.",
        defaultLabel: "Standardprofil",
        activeLabel: "Aktiv lins",
        scoreLabel: "Lins-poäng",
        insufficient: "Otillräcklig data",
        reset: "Återställ till standard",
        temporary: "Tillfällig",
      }
    : {
        eyebrow: "Temporary investment perspective",
        title: "Test the stock through another lens",
        subtitle: "Temporary view — does not change your default profile, save profile settings, use analysis quota, or fetch new market data.",
        defaultLabel: "Default profile",
        activeLabel: "Active lens",
        scoreLabel: "Lens score",
        insufficient: "Insufficient data",
        reset: "Reset to default",
        temporary: "Temporary",
      };

  return (
    <Card className="border-[#b99b5f]/30 bg-[#b99b5f]/5 p-5 print:hidden" data-testid="analysis-lens-control">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#e1cb95]">{copy.eyebrow}</p>
          <h2 className="mt-1 text-lg font-semibold text-[#f4efe5]">{copy.title}</h2>
          <p className="mt-2 text-sm leading-6 text-[#9aa7b8]">{copy.subtitle}</p>
        </div>
        <div className="rounded-md border border-white/10 bg-black/20 px-4 py-3 text-right">
          <p className="text-xs text-[#9aa7b8]">{copy.scoreLabel}</p>
          <p className="number mt-1 text-2xl font-semibold text-[#f4efe5]">
            {lensScore === null ? copy.insufficient : `${Math.round(lensScore)}/100`}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8" role="group" aria-label={copy.title}>
        {ANALYSIS_LENS_PROFILES.map((profile) => (
          <button
            key={profile}
            type="button"
            aria-pressed={profile === value}
            data-testid={`analysis-lens-${profile}`}
            onClick={() => onChange(profile)}
            className={`rounded-md border px-3 py-2 text-sm font-semibold transition ${
              profile === value
                ? "border-[#e1cb95]/70 bg-[#b99b5f]/20 text-[#f4efe5] shadow-[0_0_0_1px_rgba(225,203,149,0.08)]"
                : "border-white/10 bg-white/5 text-[#aeb8c6] hover:border-[#b99b5f]/40 hover:text-[#f4efe5]"
            }`}
          >
            {profileLabel(profile, locale)}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3 rounded-md border border-white/10 bg-white/[0.03] p-3">
        <div>
          <p className="text-xs font-semibold text-[#e1cb95]">
            {copy.activeLabel}: {profileLabel(value, locale)}{changed ? ` · ${copy.temporary}` : ""}
          </p>
          <p className="mt-1 max-w-4xl text-xs leading-5 text-[#9aa7b8]">{presentation.description}</p>
          <p className="mt-1 text-xs text-[#778596]">{copy.defaultLabel}: {profileLabel(defaultProfile, locale)}</p>
        </div>
        {changed ? (
          <button
            type="button"
            onClick={() => onChange(defaultProfile)}
            className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-[#d6deea] hover:border-[#b99b5f]/40"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            {copy.reset}
          </button>
        ) : null}
      </div>
    </Card>
  );
}
