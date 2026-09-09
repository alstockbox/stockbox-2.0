import {
  deriveRecommendationLifecycleV3,
  type RecommendationLifecycleEventV3,
} from "./recommendation-lifecycle-v3";
import type { RecommendationV3Rating } from "./recommendation-v3";

export const RECOMMENDATION_OPPORTUNITY_FEED_POLICY_VERSION = "stockbox-recommendation-opportunity-feed-v3.0.0" as const;

export const RECOMMENDATION_OPPORTUNITY_MIN_DATA_QUALITY_V3 = 50;
export const RECOMMENDATION_OPPORTUNITY_MIN_INTEGRITY_V3 = 55;
export const RECOMMENDATION_OPPORTUNITY_MIN_VERIFIED_COVERAGE_V3 = 0.5;

export type RecommendationOpportunityAuditV3 = {
  id: string;
  observedAt: string;
  ticker: string;
  analysisArchetype: string;
  modelVersion: string;
  recommendationPolicyVersion: string;
  rating: RecommendationV3Rating;
  objectiveScore: number | null;
  conviction: number;
  dataQuality: number;
  modelUncertainty: number;
  reasonCodes: string[];
  verifiedCoverage: number;
  recommendationEligible: boolean;
  recommendationIntegrityEligible: boolean;
  confidenceGatePassed: boolean;
  confidenceGateHardBlocked: boolean;
  dataIntegrityScore: number;
};

export type RecommendationOpportunityCardV3 = {
  ticker: string;
  rating: RecommendationV3Rating;
  objectiveScore: number;
  opportunityScore: number;
  conviction: number;
  dataQuality: number;
  modelUncertainty: number;
  verifiedCoverage: number;
  dataIntegrityScore: number;
  observedAt: string;
  analysisArchetype: string;
  reasonCodes: string[];
  lifecycleState: RecommendationLifecycleEventV3["state"];
  categories: RecommendationOpportunityCategoryV3[];
};

export type RecommendationOpportunityCategoryV3 =
  | "STRONG_BUY"
  | "BUY"
  | "WATCH"
  | "ETF"
  | "VALUATION"
  | "MOMENTUM"
  | "QUALITY"
  | "CONTRARIAN"
  | "HIGH_RISK_HIGH_UPSIDE";

export type RecommendationWhatChangedCardV3 = Pick<
  RecommendationLifecycleEventV3,
  | "state"
  | "ticker"
  | "previousRating"
  | "currentRating"
  | "direction"
  | "severity"
  | "reconsider"
  | "scoreDelta"
  | "convictionDelta"
  | "dataQualityDelta"
  | "modelUncertaintyDelta"
  | "reasonCodes"
  | "observedAt"
>;

export type RecommendationOpportunityFeedV3 = {
  policyVersion: typeof RECOMMENDATION_OPPORTUNITY_FEED_POLICY_VERSION;
  top: RecommendationOpportunityCardV3[];
  strongBuy: RecommendationOpportunityCardV3[];
  buy: RecommendationOpportunityCardV3[];
  watch: RecommendationOpportunityCardV3[];
  etf: RecommendationOpportunityCardV3[];
  valuation: RecommendationOpportunityCardV3[];
  momentum: RecommendationOpportunityCardV3[];
  quality: RecommendationOpportunityCardV3[];
  contrarian: RecommendationOpportunityCardV3[];
  highRiskHighUpside: RecommendationOpportunityCardV3[];
  whatChanged: RecommendationWhatChangedCardV3[];
};

const RATING_BONUS: Record<RecommendationV3Rating, number> = {
  STRONG_BUY: 10,
  BUY: 5,
  HOLD: 0,
  WAIT: -2,
  REDUCE: -8,
  SELL: -12,
  UNAVAILABLE: -25,
};

const OPPORTUNITY_RATINGS = new Set<RecommendationV3Rating>(["STRONG_BUY", "BUY", "HOLD", "WAIT"]);
const TOP_OPPORTUNITY_RATINGS = new Set<RecommendationV3Rating>(["STRONG_BUY", "BUY"]);

function clamp(value: number, min = 0, max = 100): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizedTicker(value: string): string {
  return value.trim().toUpperCase();
}

function isEtfArchetype(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized.includes("etf") || normalized.includes("exchange_traded_fund");
}

function hasReasonToken(reasonCodes: string[], token: string): boolean {
  const upper = token.toUpperCase();
  return reasonCodes.some((reason) => reason.toUpperCase().includes(upper));
}

function eligible(snapshot: RecommendationOpportunityAuditV3): snapshot is RecommendationOpportunityAuditV3 & { objectiveScore: number } {
  return snapshot.recommendationEligible
    && snapshot.recommendationIntegrityEligible
    && snapshot.confidenceGatePassed
    && !snapshot.confidenceGateHardBlocked
    && OPPORTUNITY_RATINGS.has(snapshot.rating)
    && typeof snapshot.objectiveScore === "number"
    && Number.isFinite(snapshot.objectiveScore)
    && Number.isFinite(snapshot.dataQuality)
    && snapshot.dataQuality >= RECOMMENDATION_OPPORTUNITY_MIN_DATA_QUALITY_V3
    && Number.isFinite(snapshot.dataIntegrityScore)
    && snapshot.dataIntegrityScore >= RECOMMENDATION_OPPORTUNITY_MIN_INTEGRITY_V3
    && Number.isFinite(snapshot.verifiedCoverage)
    && snapshot.verifiedCoverage >= RECOMMENDATION_OPPORTUNITY_MIN_VERIFIED_COVERAGE_V3;
}

function opportunityScore(snapshot: RecommendationOpportunityAuditV3 & { objectiveScore: number }): number {
  const score = snapshot.objectiveScore
    + RATING_BONUS[snapshot.rating]
    + (clamp(snapshot.conviction) - 50) * 0.12
    + (clamp(snapshot.dataQuality) - 50) * 0.10
    + (50 - clamp(snapshot.modelUncertainty)) * 0.08
    + (clamp(snapshot.dataIntegrityScore) - 50) * 0.08
    + (clamp(snapshot.verifiedCoverage, 0, 1) - 0.5) * 10;
  return Math.round(clamp(score) * 10) / 10;
}

function categoriesFor(snapshot: RecommendationOpportunityAuditV3 & { objectiveScore: number }): RecommendationOpportunityCategoryV3[] {
  const categories: RecommendationOpportunityCategoryV3[] = [];
  if (snapshot.rating === "STRONG_BUY") categories.push("STRONG_BUY");
  if (snapshot.rating === "BUY") categories.push("BUY");
  if (snapshot.rating === "HOLD" || snapshot.rating === "WAIT") categories.push("WATCH");
  if (isEtfArchetype(snapshot.analysisArchetype)) categories.push("ETF");
  if (hasReasonToken(snapshot.reasonCodes, "VALUATION")) categories.push("VALUATION");
  if (hasReasonToken(snapshot.reasonCodes, "MOMENTUM")) categories.push("MOMENTUM");
  if (hasReasonToken(snapshot.reasonCodes, "QUALITY")) categories.push("QUALITY");
  if (hasReasonToken(snapshot.reasonCodes, "CONTRARIAN")) categories.push("CONTRARIAN");
  if (
    snapshot.objectiveScore >= 75
    && snapshot.modelUncertainty >= 60
    && (hasReasonToken(snapshot.reasonCodes, "UPSIDE") || snapshot.rating === "STRONG_BUY" || snapshot.rating === "BUY")
  ) {
    categories.push("HIGH_RISK_HIGH_UPSIDE");
  }
  return categories;
}

function lifecycleFor(
  previous: RecommendationOpportunityAuditV3 | null,
  current: RecommendationOpportunityAuditV3,
): RecommendationLifecycleEventV3 {
  return deriveRecommendationLifecycleV3(
    previous ? {
      snapshotId: previous.id,
      ticker: previous.ticker,
      observedAt: previous.observedAt,
      rating: previous.rating,
      objectiveScore: previous.objectiveScore,
      conviction: previous.conviction,
      dataQuality: previous.dataQuality,
      modelUncertainty: previous.modelUncertainty,
    } : null,
    {
      snapshotId: current.id,
      ticker: current.ticker,
      observedAt: current.observedAt,
      rating: current.rating,
      objectiveScore: current.objectiveScore,
      conviction: current.conviction,
      dataQuality: current.dataQuality,
      modelUncertainty: current.modelUncertainty,
    },
  );
}

function cardFor(
  snapshot: RecommendationOpportunityAuditV3 & { objectiveScore: number },
  lifecycle: RecommendationLifecycleEventV3,
): RecommendationOpportunityCardV3 {
  return {
    ticker: normalizedTicker(snapshot.ticker),
    rating: snapshot.rating,
    objectiveScore: snapshot.objectiveScore,
    opportunityScore: opportunityScore(snapshot),
    conviction: clamp(snapshot.conviction),
    dataQuality: clamp(snapshot.dataQuality),
    modelUncertainty: clamp(snapshot.modelUncertainty),
    verifiedCoverage: clamp(snapshot.verifiedCoverage, 0, 1),
    dataIntegrityScore: clamp(snapshot.dataIntegrityScore),
    observedAt: snapshot.observedAt,
    analysisArchetype: snapshot.analysisArchetype,
    reasonCodes: [...snapshot.reasonCodes],
    lifecycleState: lifecycle.state,
    categories: categoriesFor(snapshot),
  };
}

function compareCards(left: RecommendationOpportunityCardV3, right: RecommendationOpportunityCardV3): number {
  const scoreDelta = right.opportunityScore - left.opportunityScore;
  if (scoreDelta !== 0) return scoreDelta;
  const integrityDelta = right.dataIntegrityScore - left.dataIntegrityScore;
  if (integrityDelta !== 0) return integrityDelta;
  return left.ticker.localeCompare(right.ticker);
}

function section(
  cards: RecommendationOpportunityCardV3[],
  category: RecommendationOpportunityCategoryV3,
  limit: number,
) {
  return cards.filter((card) => card.categories.includes(category)).slice(0, limit);
}

export function buildRecommendationOpportunityFeedV3(
  snapshots: RecommendationOpportunityAuditV3[],
  options: { sectionLimit?: number; topLimit?: number; whatChangedLimit?: number } = {},
): RecommendationOpportunityFeedV3 {
  const sectionLimit = Math.max(1, Math.min(options.sectionLimit ?? 20, 100));
  const topLimit = Math.max(1, Math.min(options.topLimit ?? 20, 100));
  const whatChangedLimit = Math.max(1, Math.min(options.whatChangedLimit ?? 30, 100));

  const grouped = new Map<string, RecommendationOpportunityAuditV3[]>();
  for (const snapshot of snapshots) {
    const ticker = normalizedTicker(snapshot.ticker);
    if (!ticker || !Number.isFinite(Date.parse(snapshot.observedAt))) continue;
    const rows = grouped.get(ticker) ?? [];
    rows.push({ ...snapshot, ticker });
    grouped.set(ticker, rows);
  }

  const cards: RecommendationOpportunityCardV3[] = [];
  const changes: RecommendationWhatChangedCardV3[] = [];

  for (const rows of grouped.values()) {
    rows.sort((left, right) => Date.parse(right.observedAt) - Date.parse(left.observedAt));
    const current = rows[0];
    if (!current) continue;
    const previous = rows[1] ?? null;
    const lifecycle = lifecycleFor(previous, current);

    if (previous && lifecycle.material && lifecycle.state !== "NEW") {
      changes.push({
        state: lifecycle.state,
        ticker: lifecycle.ticker,
        previousRating: lifecycle.previousRating,
        currentRating: lifecycle.currentRating,
        direction: lifecycle.direction,
        severity: lifecycle.severity,
        reconsider: lifecycle.reconsider,
        scoreDelta: lifecycle.scoreDelta,
        convictionDelta: lifecycle.convictionDelta,
        dataQualityDelta: lifecycle.dataQualityDelta,
        modelUncertaintyDelta: lifecycle.modelUncertaintyDelta,
        reasonCodes: [...lifecycle.reasonCodes],
        observedAt: lifecycle.observedAt,
      });
    }

    if (eligible(current)) cards.push(cardFor(current, lifecycle));
  }

  cards.sort(compareCards);
  changes.sort((left, right) => {
    const severityRank = { important: 2, watch: 1, info: 0 } as const;
    const severityDelta = severityRank[right.severity] - severityRank[left.severity];
    if (severityDelta !== 0) return severityDelta;
    return Date.parse(right.observedAt) - Date.parse(left.observedAt);
  });

  return {
    policyVersion: RECOMMENDATION_OPPORTUNITY_FEED_POLICY_VERSION,
    top: cards.filter((card) => TOP_OPPORTUNITY_RATINGS.has(card.rating)).slice(0, topLimit),
    strongBuy: section(cards, "STRONG_BUY", sectionLimit),
    buy: section(cards, "BUY", sectionLimit),
    watch: section(cards, "WATCH", sectionLimit),
    etf: section(cards, "ETF", sectionLimit),
    valuation: section(cards, "VALUATION", sectionLimit),
    momentum: section(cards, "MOMENTUM", sectionLimit),
    quality: section(cards, "QUALITY", sectionLimit),
    contrarian: section(cards, "CONTRARIAN", sectionLimit),
    highRiskHighUpside: section(cards, "HIGH_RISK_HIGH_UPSIDE", sectionLimit),
    whatChanged: changes.slice(0, whatChangedLimit),
  };
}
