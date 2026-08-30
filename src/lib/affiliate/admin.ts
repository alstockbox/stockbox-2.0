function slugifyName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28) || "AMBASSADOR";
}

export function buildAffiliateCode(displayName: string, suffix: string) {
  const cleanSuffix = suffix.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  return `${slugifyName(displayName)}-${cleanSuffix || "CODE"}`.slice(0, 48);
}

export function commissionPercentToBasisPoints(percent: number) {
  if (!Number.isFinite(percent)) return 0;
  return Math.max(0, Math.min(10_000, Math.round(percent * 100)));
}

export function normalizeMonthlyAnalysisLimit(value: number) {
  if (!Number.isFinite(value)) return 100;
  return Math.max(0, Math.min(100_000, Math.floor(value)));
}