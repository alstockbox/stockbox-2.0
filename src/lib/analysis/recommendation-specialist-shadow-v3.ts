import { createHash } from "node:crypto";
import type { RecommendationV3Rating } from "@/lib/analysis/recommendation-v3";
import type { RecommendationV3ShadowEvent } from "@/lib/analysis/recommendation-v3-shadow";
import type { UniversalSecurityReport } from "@/lib/data/universal-security-provider";

export const SPECIALIST_RECOMMENDATION_V3_POLICY_VERSION = "stockbox-specialist-recommendation-policy-v3.0.0" as const;
export const SPECIALIST_COVERAGE_V3_POLICY_VERSION = "stockbox-specialist-coverage-policy-v3.0.0" as const;
export const SPECIALIST_INTEGRITY_V3_POLICY_VERSION = "stockbox-specialist-integrity-policy-v3.0.0" as const;
export const ETF_SPECIALIST_MODEL_VERSION = "stockbox-etf-specialist-v1" as const;
export const INVESTMENT_COMPANY_SPECIALIST_MODEL_VERSION = "stockbox-investment-company-specialist-v1" as const;

const MIN_DIRECTIONAL_COVERAGE = 0.5;
const HIGH_CONFIDENCE_COVERAGE = 0.8;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeLegacyRating(rating: string): RecommendationV3Rating {
  switch (rating) {
    case "Strong Buy": return "STRONG_BUY";
    case "Buy": return "BUY";
    case "Hold": return "HOLD";
    case "Sell":
    case "Strong Sell": return "SELL";
    default: return "UNAVAILABLE";
  }
}

function baseRating(score: number | null): RecommendationV3Rating {
  if (score === null) return "UNAVAILABLE";
  if (score >= 84) return "STRONG_BUY";
  if (score >= 68) return "BUY";
  if (score >= 56) return "HOLD";
  if (score >= 45) return "WAIT";
  if (score >= 30) return "REDUCE";
  return "SELL";
}

function directional(rating: RecommendationV3Rating): boolean {
  return ["STRONG_BUY", "BUY", "REDUCE", "SELL"].includes(rating);
}

type SpecialistKind = "ETF" | "INVESTMENT_COMPANY";

function specialistKind(report: UniversalSecurityReport): SpecialistKind | null {
  if (report.securityAnalysis?.etf) return "ETF";
  if (report.securityAnalysis?.investmentCompany) return "INVESTMENT_COMPANY";
  return null;
}

function specialistScore(report: UniversalSecurityReport, kind: SpecialistKind) {
  return kind === "ETF"
    ? report.securityAnalysis?.etf?.score ?? null
    : report.securityAnalysis?.investmentCompany?.score ?? null;
}

function specialistTicker(report: UniversalSecurityReport): string | null {
  const ticker = report.ticker.trim().toUpperCase();
  return ticker.length > 0 ? ticker : null;
}

function analysisFingerprint(
  report: UniversalSecurityReport,
  kind: SpecialistKind,
  ticker: string,
): string {
  const payload = JSON.stringify({
    ticker,
    kind,
    dataAsOf: report.dataAsOf ?? null,
    recommendation: report.recommendation,
    specialistAnalysis: kind === "ETF"
      ? report.securityAnalysis?.etf ?? null
      : report.securityAnalysis?.investmentCompany ?? null,
    diagnostics: (report.providerDiagnostics ?? []).map((item) => ({
      provider: item.provider,
      capability: item.capability,
      status: item.status,
      reason: item.reason ?? null,
    })),
  });
  return `specialist-v3:${createHash("sha256").update(payload).digest("hex")}`;
}

function integrityAssessment(report: UniversalSecurityReport, objectiveScore: number | null) {
  const diagnostics = report.providerDiagnostics ?? [];
  const unavailable = diagnostics.filter((item) => item.status === "unavailable").length;
  const partial = diagnostics.filter((item) => item.status === "partial").length;
  const anomalyCodes: string[] = [];
  let blocking = 0;

  if (objectiveScore === null) {
    anomalyCodes.push("SPECIALIST_OBJECTIVE_SCORE_UNAVAILABLE");
    blocking += 1;
  }
  if (report.dataStatus === "unavailable") {
    anomalyCodes.push("SPECIALIST_DATA_UNAVAILABLE");
    blocking += 1;
  } else if (report.dataStatus === "stale") {
    anomalyCodes.push("SPECIALIST_DATA_STALE");
  }
  if (unavailable > 0) anomalyCodes.push("SPECIALIST_PROVIDER_UNAVAILABLE");
  if (partial > 0) anomalyCodes.push("SPECIALIST_PROVIDER_PARTIAL");

  const integrityScore = objectiveScore === null || report.dataStatus === "unavailable"
    ? 0
    : Math.round(clamp(1 - unavailable * 0.12 - partial * 0.04 - (report.dataStatus === "stale" ? 0.15 : 0)) * 100);

  return {
    unavailable,
    integrityScore,
    blocking,
    anomalyCodes: [...new Set(anomalyCodes)],
    eligible: blocking === 0,
  };
}

function specialistAnalysisArchetype(report: UniversalSecurityReport, kind: SpecialistKind): string {
  if (kind === "INVESTMENT_COMPANY") return "holding_company";
  const subtype = report.securityAnalysis?.etf?.subtype
    ?? report.securityClassification?.kind
    ?? "unknown_etf";
  return `etf:${subtype}`;
}

function specialistModelVersion(kind: SpecialistKind): string {
  return kind === "ETF" ? ETF_SPECIALIST_MODEL_VERSION : INVESTMENT_COMPANY_SPECIALIST_MODEL_VERSION;
}

/**
 * Creates an objective Recommendation V3 audit event from specialist output.
 * It never converts ETF/fund data into corporate revenue, payout, DCF or balance-
 * sheet inputs. Missing specialist evidence remains missing and is represented
 * through coverage/integrity gates instead of synthetic company metrics.
 */
export function createSpecialistRecommendationV3ShadowEvent(
  report: UniversalSecurityReport,
  observedAt = new Date().toISOString(),
): RecommendationV3ShadowEvent | null {
  const ticker = specialistTicker(report);
  if (ticker === null) return null;

  const kind = specialistKind(report);
  if (!kind) return null;
  const score = specialistScore(report, kind);
  if (!score) return null;

  const objectiveScore = finite(score.score) ? score.score : null;
  const coverage = clamp(finite(score.coverage) ? score.coverage : 0);
  const confidence = Math.round(coverage * 100);
  const integrity = integrityAssessment(report, objectiveScore);
  const reasonCodes = ["SPECIALIST_SECURITY_MODEL"];
  const hardBlocked = objectiveScore === null
    || report.dataStatus === "unavailable"
    || coverage < MIN_DIRECTIONAL_COVERAGE
    || !integrity.eligible;

  let rating = hardBlocked ? "UNAVAILABLE" as RecommendationV3Rating : baseRating(objectiveScore);
  if (coverage < MIN_DIRECTIONAL_COVERAGE) reasonCodes.push("SPECIALIST_CRITICAL_COVERAGE_GAP");
  else if (coverage < HIGH_CONFIDENCE_COVERAGE) reasonCodes.push("SPECIALIST_LIMITED_COVERAGE");
  if (confidence < 55 && directional(rating)) {
    rating = "WAIT";
    reasonCodes.push("SPECIALIST_LIMITED_MODEL_CONFIDENCE");
  }
  if (coverage < HIGH_CONFIDENCE_COVERAGE && rating === "STRONG_BUY") {
    rating = "BUY";
    reasonCodes.push("SPECIALIST_STRONG_BUY_COVERAGE_CAP");
  }

  const criticalFlags = report.redFlags.filter((flag) => flag.severity === "critical").length;
  const highFlags = report.redFlags.filter((flag) => flag.severity === "high").length;
  if (criticalFlags > 0 && directional(rating)) {
    rating = "WAIT";
    reasonCodes.push("SPECIALIST_CRITICAL_RED_FLAG");
  } else if (highFlags > 0 && rating === "STRONG_BUY") {
    rating = "BUY";
    reasonCodes.push("SPECIALIST_HIGH_RED_FLAG_CAP");
  }
  reasonCodes.push(...integrity.anomalyCodes);

  const normalizedLegacy = normalizeLegacyRating(String(report.recommendation));
  const conviction = hardBlocked
    ? 0
    : Math.round(clamp(coverage - integrity.unavailable * 0.05 - (report.dataStatus === "stale" ? 0.1 : 0)) * 100);
  const confidenceGatePassed = !hardBlocked
    && coverage >= HIGH_CONFIDENCE_COVERAGE
    && confidence >= 55
    && criticalFlags === 0;

  return {
    event: "stockbox.recommendation_v3_shadow",
    observedAt,
    ticker,
    analysisFingerprint: analysisFingerprint(report, kind, ticker),
    analysisArchetype: specialistAnalysisArchetype(report, kind),
    sector: report.engine?.scores?.sector ?? null,
    legacyRating: String(report.recommendation),
    normalizedLegacyRating: normalizedLegacy,
    v3Rating: rating,
    changed: normalizedLegacy !== rating,
    objectiveScore,
    conviction,
    dataQuality: confidence,
    modelUncertainty: 100 - conviction,
    hadPersonalizedScore: false,
    confidenceGatePassed,
    confidenceGateHardBlocked: hardBlocked,
    reasonCodes: [...new Set(reasonCodes)],
    coveragePolicyVersion: SPECIALIST_COVERAGE_V3_POLICY_VERSION,
    anomalyPolicyVersion: SPECIALIST_INTEGRITY_V3_POLICY_VERSION,
    recommendationPolicyVersion: SPECIALIST_RECOMMENDATION_V3_POLICY_VERSION,
    coverageProfile: kind === "ETF" ? specialistAnalysisArchetype(report, kind) : "specialist:investment_company",
    verifiedCoverage: coverage,
    retrievalCoverage: coverage,
    conflictCount: 0,
    stockboxFailureCount: 0,
    sourceUnavailableCount: integrity.unavailable,
    recommendationEligible: objectiveScore !== null && coverage >= MIN_DIRECTIONAL_COVERAGE && report.dataStatus !== "unavailable",
    dataIntegrityScore: integrity.integrityScore,
    blockingAnomalyCount: integrity.blocking,
    anomalyCodes: integrity.anomalyCodes,
    recommendationIntegrityEligible: integrity.eligible,
    modelVersion: specialistModelVersion(kind),
  };
}