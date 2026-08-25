export type FeatureFlag =
  | "news"
  | "batchAnalysis"
  | "portfolio"
  | "admin"
  | "aiAssistant"
  | "affiliate"
  | "referrals"
  | "stockBattle";

const defaults: Record<FeatureFlag, boolean> = {
  news: false,
  batchAnalysis: true,
  portfolio: true,
  admin: true,
  aiAssistant: false,
  affiliate: false,
  referrals: false,
  stockBattle: false
};

export function isFeatureEnabled(flag: FeatureFlag) {
  const override = process.env[`FEATURE_${flag.toUpperCase()}`];
  if (override === "true") return true;
  if (override === "false") return false;
  return defaults[flag];
}
