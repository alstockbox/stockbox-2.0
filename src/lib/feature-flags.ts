export type FeatureFlag =
  | "news"
  | "batchAnalysis"
  | "portfolio"
  | "admin"
  | "aiAssistant"
  | "affiliate"
  | "referrals"
  | "stockBattle"
  | "stockbox3Shell"
  | "dataCoverageV3"
  | "recommendationV3"
  | "portfolioV3"
  | "watchlistV3"
  | "alerts"
  | "dailyBriefing"
  | "academy"
  | "investorScore"
  | "paperTrading"
  | "leaderboards"
  | "privateLeagues"
  | "challenges"
  | "discovery"
  | "thesisTools"
  | "decisionJournal"
  | "growthEngineV3";

const defaults: Record<FeatureFlag, boolean> = {
  news: false,
  batchAnalysis: true,
  portfolio: true,
  admin: true,
  aiAssistant: false,
  affiliate: false,
  referrals: false,
  stockBattle: false,
  stockbox3Shell: false,
  dataCoverageV3: false,
  recommendationV3: false,
  portfolioV3: false,
  watchlistV3: false,
  alerts: false,
  dailyBriefing: false,
  academy: false,
  investorScore: false,
  paperTrading: false,
  leaderboards: false,
  privateLeagues: false,
  challenges: false,
  discovery: false,
  thesisTools: false,
  decisionJournal: false,
  growthEngineV3: false,
};

export type KillSwitch =
  | "recommendationEngine"
  | "financialDataWrites"
  | "paperTrading"
  | "growthPublishing"
  | "backgroundJobs";

/**
 * Feature flags default to the existing StockBox 2.0 behavior. All new 3.0
 * surfaces are dark by default until their phase gate has passed.
 */
export function isFeatureEnabled(flag: FeatureFlag) {
  const override = process.env[`FEATURE_${flag.toUpperCase()}`];
  if (override === "true") return true;
  if (override === "false") return false;
  return defaults[flag];
}

/**
 * Emergency switches are fail-open only when explicitly unset. Setting any
 * KILL_SWITCH_<NAME>=true disables the corresponding subsystem without taking
 * the whole application offline.
 */
export function isKilled(switchName: KillSwitch) {
  return process.env[`KILL_SWITCH_${switchName.toUpperCase()}`] === "true";
}
