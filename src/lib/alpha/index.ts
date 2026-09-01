export { ALPHA_MODEL_VERSION, computeAlphaIntelligence } from "./engine";
export { buildAlphaSignalInputFromReport } from "./report-adapter";
export {
  MARKET_CAP_POLICY_VERSION,
  capLiquidityRiskForBand,
  resolveMarketCapBand,
  sizePotentialForBand,
} from "./market-cap";
export type { MarketCapBand } from "./market-cap";
export type {
  AlphaClassification,
  AlphaDimensionScores,
  AlphaHistoryPoint,
  AlphaIntelligenceResult,
  AlphaProbabilityCurve,
  AlphaRisk,
  AlphaSignalInput,
  AlphaUpsideProbability,
} from "./types";
