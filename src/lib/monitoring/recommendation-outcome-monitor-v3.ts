import {
  RECOMMENDATION_OUTCOME_HORIZONS_V3,
  recommendationOutcomeExpectedAtV3,
  type RecommendationOutcomeHorizonV3,
  type RecommendationSnapshotV3,
} from "@/lib/analysis/recommendation-learning-v3";
import type { RecommendationV3Rating } from "@/lib/analysis/recommendation-v3";
import type { MarketPricePoint, MarketSnapshot } from "@/lib/analysis/types";

const DAY_MS = 86_400_000;
const MAX_ENTRY_PRICE_AGE_DAYS = 7;
const MAX_HORIZON_PRICE_LAG_DAYS = 7;

const DIRECTIONAL_RATINGS = new Set<RecommendationV3Rating>([
  "STRONG_BUY",
  "BUY",
  "REDUCE",
  "SELL",
]);

export type RecommendationAuditForOutcomeV3 = {
  id: string;
  observed_at: string;
  ticker: string;
  analysis_fingerprint: string | null;
  analysis_archetype: string;
  model_version: string;
  recommendation_policy_version: string;
  v3_rating: RecommendationV3Rating;
  objective_score: number | null;
  conviction: number;
  data_quality: number;
  model_uncertainty: number;
  reason_codes: string[];
};

export type RecommendationOutcomeWorkV3 = {
  audit: RecommendationAuditForOutcomeV3;
  horizon: RecommendationOutcomeHorizonV3;
  expectedAt: string;
};

export type VerifiedPriceObservationV3 = {
  price: number;
  observedAt: string;
  currency: string | null;
  provider: string | null;
};

function parseMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const normalized = value.includes("T") ? value : `${value}T00:00:00.000Z`;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function normalizedHistory(market: MarketSnapshot): Array<MarketPricePoint & { timestamp: number }> {
  return (market.priceHistory ?? [])
    .flatMap((point) => {
      const timestamp = parseMs(point.date);
      return timestamp !== null && finitePositive(point.close) ? [{ ...point, timestamp }] : [];
    })
    .sort((left, right) => left.timestamp - right.timestamp);
}

function observation(
  market: MarketSnapshot,
  point: MarketPricePoint & { timestamp: number },
): VerifiedPriceObservationV3 {
  return {
    price: point.close,
    observedAt: point.date.slice(0, 10),
    currency: market.currency?.trim().toUpperCase() || null,
    provider: market.provider?.trim() || null,
  };
}

function auditSnapshot(audit: RecommendationAuditForOutcomeV3): RecommendationSnapshotV3 {
  return {
    snapshotId: audit.id,
    observedAt: audit.observed_at,
    ticker: audit.ticker.trim().toUpperCase(),
    analysisFingerprint: audit.analysis_fingerprint,
    analysisArchetype: audit.analysis_archetype,
    modelVersion: audit.model_version,
    recommendationPolicyVersion: audit.recommendation_policy_version,
    rating: audit.v3_rating,
    objectiveScore: audit.objective_score,
    conviction: audit.conviction,
    dataQuality: audit.data_quality,
    modelUncertainty: audit.model_uncertainty,
    reasonCodes: [...audit.reason_codes],
  };
}

export function recommendationOutcomeJobDedupeKeyV3(
  recommendationAuditId: string,
  horizon: RecommendationOutcomeHorizonV3,
): string {
  return `recommendation-outcome:${recommendationAuditId.trim()}:${horizon}`;
}

/**
 * Entry is the latest verified close on or before the recommendation timestamp.
 * A stale observation is rejected instead of being silently treated as the
 * decision's entry price.
 */
export function selectEntryPriceObservationV3(
  market: MarketSnapshot,
  snapshotAt: string,
): VerifiedPriceObservationV3 | null {
  const targetMs = parseMs(snapshotAt);
  if (targetMs === null) return null;

  const selected = normalizedHistory(market)
    .filter((point) => point.timestamp <= targetMs)
    .at(-1);
  if (!selected) return null;

  const ageDays = (targetMs - selected.timestamp) / DAY_MS;
  if (ageDays > MAX_ENTRY_PRICE_AGE_DAYS) return null;
  return observation(market, selected);
}

/**
 * Horizon evaluation uses the first verified market close on or after the due
 * timestamp. The seven-day tolerance safely spans weekends/ordinary holidays
 * while rejecting materially late observations.
 */
export function selectHorizonPriceObservationV3(
  market: MarketSnapshot,
  expectedAt: string,
): VerifiedPriceObservationV3 | null {
  const targetMs = parseMs(expectedAt);
  if (targetMs === null) return null;

  const selected = normalizedHistory(market)
    .find((point) => point.timestamp >= targetMs);
  if (!selected) return null;

  const lagDays = (selected.timestamp - targetMs) / DAY_MS;
  if (lagDays > MAX_HORIZON_PRICE_LAG_DAYS) return null;
  return observation(market, selected);
}

/**
 * Produces only missing, due, directional learning work. HOLD/WAIT/UNAVAILABLE
 * stay in the recommendation audit for product QA but do not contaminate the
 * directional hit-rate calibration dataset.
 */
export function buildDueRecommendationOutcomeWorkV3(input: {
  audits: RecommendationAuditForOutcomeV3[];
  completed: Map<string, Set<RecommendationOutcomeHorizonV3>>;
  now?: Date;
}): RecommendationOutcomeWorkV3[] {
  const nowMs = (input.now ?? new Date()).getTime();
  if (!Number.isFinite(nowMs)) return [];

  const work: RecommendationOutcomeWorkV3[] = [];
  for (const audit of input.audits) {
    if (!DIRECTIONAL_RATINGS.has(audit.v3_rating)) continue;

    const snapshot = auditSnapshot(audit);
    const completed = input.completed.get(audit.id) ?? new Set<RecommendationOutcomeHorizonV3>();
    for (const horizon of RECOMMENDATION_OUTCOME_HORIZONS_V3) {
      if (completed.has(horizon)) continue;
      const expectedAt = recommendationOutcomeExpectedAtV3(snapshot, horizon);
      if (Date.parse(expectedAt) > nowMs) continue;
      work.push({ audit, horizon, expectedAt });
    }
  }
  return work;
}
