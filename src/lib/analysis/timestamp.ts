import type { Locale } from "@/lib/i18n/types";

export function formatAnalysisTimestamp(value: string, locale: Locale = "en") {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "sv" ? "sv-SE" : "en-GB", {
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
    timeZone: "UTC", timeZoneName: "short",
  }).format(date);
}

export function analysisDateSlug(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : "analysis";
}
