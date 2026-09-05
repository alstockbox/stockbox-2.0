import type { RecommendationV3Rating } from "@/lib/analysis/recommendation-v3";

export const ANALYSIS_ALERTS_V3_POLICY_VERSION = "stockbox-analysis-alerts-v3.0.0" as const;

export type AnalysisAlertKindV3 =
  | "RECOMMENDATION_CHANGE"
  | "CONVICTION_DROP"
  | "DATA_QUALITY_DROP"
  | "PRICE_ABOVE"
  | "PRICE_BELOW";

export type AnalysisAlertSeverityV3 = "info" | "watch" | "important";

export type AnalysisAlertSnapshotV3 = {
  ticker: string;
  analysisId: string | null;
  observedAt: string;
  rating: RecommendationV3Rating;
  objectiveScore: number | null;
  conviction: number;
  dataQuality: number;
  price: number | null;
  currency: string | null;
};

export type AnalysisAlertPreferencesV3 = {
  recommendationChanges?: boolean;
  convictionDropMinimum?: number;
  dataQualityDropMinimum?: number;
  priceAbove?: number | null;
  priceBelow?: number | null;
};

export type AnalysisAlertEventV3 = {
  policyVersion: typeof ANALYSIS_ALERTS_V3_POLICY_VERSION;
  kind: AnalysisAlertKindV3;
  severity: AnalysisAlertSeverityV3;
  ticker: string;
  dedupeKey: string;
  sourceAnalysisId: string | null;
  observedAt: string;
  messageKey:
    | "alerts.recommendationChanged"
    | "alerts.convictionDropped"
    | "alerts.dataQualityDropped"
    | "alerts.priceCrossedAbove"
    | "alerts.priceCrossedBelow";
  payload: Record<string, string | number | null>;
};

const clampPercent = (value: number) => Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
const finiteOrNull = (value: number | null) => typeof value === "number" && Number.isFinite(value) ? value : null;
const normalizedTicker = (ticker: string) => ticker.trim().toUpperCase();

function normalizeSnapshot(snapshot: AnalysisAlertSnapshotV3): AnalysisAlertSnapshotV3 {
  return {
    ...snapshot,
    ticker: normalizedTicker(snapshot.ticker),
    objectiveScore: finiteOrNull(snapshot.objectiveScore),
    conviction: clampPercent(snapshot.conviction),
    dataQuality: clampPercent(snapshot.dataQuality),
    price: finiteOrNull(snapshot.price),
    currency: snapshot.currency?.trim().toUpperCase() || null,
  };
}

function eventKey(
  current: AnalysisAlertSnapshotV3,
  kind: AnalysisAlertKindV3,
  discriminator: string,
): string {
  const source = current.analysisId?.trim() || current.observedAt;
  return `${ANALYSIS_ALERTS_V3_POLICY_VERSION}:${current.ticker}:${kind}:${source}:${discriminator}`;
}

function recommendationSeverity(
  previous: RecommendationV3Rating,
  current: RecommendationV3Rating,
): AnalysisAlertSeverityV3 {
  const directional = new Set<RecommendationV3Rating>(["STRONG_BUY", "BUY", "REDUCE", "SELL"]);
  if (current === "UNAVAILABLE" || previous === "UNAVAILABLE") return "important";
  return directional.has(previous) || directional.has(current) ? "important" : "watch";
}

/**
 * Pure, zero-provider-cost alert derivation over already-computed StockBox state.
 * User Match/personalized scores are intentionally absent from the contract, so
 * personalized suitability can never silently change an objective stock alert.
 */
export function deriveAnalysisAlertsV3(
  previousInput: AnalysisAlertSnapshotV3 | null,
  currentInput: AnalysisAlertSnapshotV3,
  preferences: AnalysisAlertPreferencesV3 = {},
): AnalysisAlertEventV3[] {
  if (!previousInput) return [];
  const previous = normalizeSnapshot(previousInput);
  const current = normalizeSnapshot(currentInput);
  if (!current.ticker || current.ticker !== previous.ticker) return [];

  const events: AnalysisAlertEventV3[] = [];
  const recommendationChanges = preferences.recommendationChanges ?? true;
  const convictionDropMinimum = Math.max(1, preferences.convictionDropMinimum ?? 20);
  const dataQualityDropMinimum = Math.max(1, preferences.dataQualityDropMinimum ?? 15);

  if (recommendationChanges && previous.rating !== current.rating) {
    events.push({
      policyVersion: ANALYSIS_ALERTS_V3_POLICY_VERSION,
      kind: "RECOMMENDATION_CHANGE",
      severity: recommendationSeverity(previous.rating, current.rating),
      ticker: current.ticker,
      dedupeKey: eventKey(current, "RECOMMENDATION_CHANGE", `${previous.rating}>${current.rating}`),
      sourceAnalysisId: current.analysisId,
      observedAt: current.observedAt,
      messageKey: "alerts.recommendationChanged",
      payload: {
        previousRating: previous.rating,
        currentRating: current.rating,
        previousScore: previous.objectiveScore,
        currentScore: current.objectiveScore,
      },
    });
  }

  const convictionDrop = previous.conviction - current.conviction;
  if (convictionDrop >= convictionDropMinimum) {
    events.push({
      policyVersion: ANALYSIS_ALERTS_V3_POLICY_VERSION,
      kind: "CONVICTION_DROP",
      severity: current.conviction < 40 ? "important" : "watch",
      ticker: current.ticker,
      dedupeKey: eventKey(current, "CONVICTION_DROP", String(Math.round(current.conviction))),
      sourceAnalysisId: current.analysisId,
      observedAt: current.observedAt,
      messageKey: "alerts.convictionDropped",
      payload: {
        previousConviction: previous.conviction,
        currentConviction: current.conviction,
        drop: convictionDrop,
      },
    });
  }

  const dataQualityDrop = previous.dataQuality - current.dataQuality;
  if (dataQualityDrop >= dataQualityDropMinimum) {
    events.push({
      policyVersion: ANALYSIS_ALERTS_V3_POLICY_VERSION,
      kind: "DATA_QUALITY_DROP",
      severity: current.dataQuality < 55 ? "important" : "watch",
      ticker: current.ticker,
      dedupeKey: eventKey(current, "DATA_QUALITY_DROP", String(Math.round(current.dataQuality))),
      sourceAnalysisId: current.analysisId,
      observedAt: current.observedAt,
      messageKey: "alerts.dataQualityDropped",
      payload: {
        previousDataQuality: previous.dataQuality,
        currentDataQuality: current.dataQuality,
        drop: dataQualityDrop,
      },
    });
  }

  const previousPrice = previous.price;
  const currentPrice = current.price;
  const above = finiteOrNull(preferences.priceAbove ?? null);
  const below = finiteOrNull(preferences.priceBelow ?? null);

  if (above !== null && previousPrice !== null && currentPrice !== null && previousPrice < above && currentPrice >= above) {
    events.push({
      policyVersion: ANALYSIS_ALERTS_V3_POLICY_VERSION,
      kind: "PRICE_ABOVE",
      severity: "info",
      ticker: current.ticker,
      dedupeKey: eventKey(current, "PRICE_ABOVE", String(above)),
      sourceAnalysisId: current.analysisId,
      observedAt: current.observedAt,
      messageKey: "alerts.priceCrossedAbove",
      payload: { threshold: above, previousPrice, currentPrice, currency: current.currency },
    });
  }

  if (below !== null && previousPrice !== null && currentPrice !== null && previousPrice > below && currentPrice <= below) {
    events.push({
      policyVersion: ANALYSIS_ALERTS_V3_POLICY_VERSION,
      kind: "PRICE_BELOW",
      severity: "info",
      ticker: current.ticker,
      dedupeKey: eventKey(current, "PRICE_BELOW", String(below)),
      sourceAnalysisId: current.analysisId,
      observedAt: current.observedAt,
      messageKey: "alerts.priceCrossedBelow",
      payload: { threshold: below, previousPrice, currentPrice, currency: current.currency },
    });
  }

  return events;
}
