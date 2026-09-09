import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { toRecommendationV3AuditRow } from "@/lib/db/recommendation-v3-audit";
import type { RecommendationV3ShadowEvent } from "@/lib/analysis/recommendation-v3-shadow";

function eventFixture(): RecommendationV3ShadowEvent {
  return {
    event: "stockbox.recommendation_v3_shadow",
    observedAt: "2026-09-05T17:30:00.000Z",
    ticker: "TEST",
    analysisFingerprint: "fingerprint-123",
    analysisArchetype: "standard",
    sector: "technology",
    legacyRating: "Strong Buy",
    normalizedLegacyRating: "STRONG_BUY",
    v3Rating: "WAIT",
    changed: true,
    objectiveScore: 88,
    conviction: 35,
    dataQuality: 65,
    modelUncertainty: 65,
    hadPersonalizedScore: true,
    confidenceGatePassed: false,
    confidenceGateHardBlocked: false,
    reasonCodes: ["DATA_ANOMALY_UNRESOLVED_SOURCE_CONFLICT"],
    coveragePolicyVersion: "stockbox-coverage-policy-v3.0.0",
    anomalyPolicyVersion: "stockbox-data-anomaly-policy-v3.0.0",
    recommendationPolicyVersion: "stockbox-recommendation-policy-v3.0.0",
    coverageProfile: "standard",
    verifiedCoverage: 0.9,
    retrievalCoverage: 0.95,
    conflictCount: 1,
    stockboxFailureCount: 0,
    sourceUnavailableCount: 0,
    recommendationEligible: false,
    dataIntegrityScore: 65,
    blockingAnomalyCount: 1,
    anomalyCodes: ["UNRESOLVED_SOURCE_CONFLICT"],
    recommendationIntegrityEligible: false,
    modelVersion: "stockbox-analysis-v2.7-test",
  };
}

describe("Recommendation V3 audit mapper", () => {
  it("persists only the explicit privacy-minimized allowlist", () => {
    const event = eventFixture();
    const row = toRecommendationV3AuditRow(event, "2026-09-05T17:31:00.000Z");

    expect(row).toEqual({
      observed_at: event.observedAt,
      ticker: "TEST",
      analysis_fingerprint: "fingerprint-123",
      analysis_archetype: "standard",
      sector: "technology",
      model_version: "stockbox-analysis-v2.7-test",
      legacy_rating: "Strong Buy",
      normalized_legacy_rating: "STRONG_BUY",
      v3_rating: "WAIT",
      changed: true,
      objective_score: 88,
      conviction: 35,
      data_quality: 65,
      model_uncertainty: 65,
      had_personalized_score: true,
      confidence_gate_passed: false,
      confidence_gate_hard_blocked: false,
      reason_codes: ["DATA_ANOMALY_UNRESOLVED_SOURCE_CONFLICT"],
      coverage_policy_version: "stockbox-coverage-policy-v3.0.0",
      anomaly_policy_version: "stockbox-data-anomaly-policy-v3.0.0",
      recommendation_policy_version: "stockbox-recommendation-policy-v3.0.0",
      coverage_profile: "standard",
      verified_coverage: 0.9,
      retrieval_coverage: 0.95,
      conflict_count: 1,
      stockbox_failure_count: 0,
      source_unavailable_count: 0,
      recommendation_eligible: false,
      data_integrity_score: 65,
      blocking_anomaly_count: 1,
      anomaly_codes: ["UNRESOLVED_SOURCE_CONFLICT"],
      recommendation_integrity_eligible: false,
      updated_at: "2026-09-05T17:31:00.000Z",
    });

    const keys = Object.keys(row);
    expect(keys).not.toContain("user_id");
    expect(keys).not.toContain("userId");
    expect(keys).not.toContain("personalized_score");
    expect(keys).not.toContain("userMatchScore");
    expect(keys).not.toContain("rawFinancials");
    expect(keys).not.toContain("providerPayload");
  });

  it("rejects blank durable audit identity instead of persisting ambiguous dedupe lineage", () => {
    for (const field of ["ticker", "analysisArchetype", "modelVersion", "recommendationPolicyVersion"] as const) {
      const event = eventFixture();
      (event as unknown as Record<string, unknown>)[field] = "   ";
      expect(() => toRecommendationV3AuditRow(event)).toThrow("INVALID_RECOMMENDATION_V3_AUDIT_IDENTITY");
    }
  });

  it("keeps a blank analysis fingerprint missing instead of creating a false identity", () => {
    const event = eventFixture();
    event.analysisFingerprint = "   ";
    expect(toRecommendationV3AuditRow(event).analysis_fingerprint).toBeNull();
  });

  it("keeps missing sector missing instead of inferring or backfilling it", () => {
    const event = eventFixture();
    delete event.sector;
    expect(toRecommendationV3AuditRow(event).sector).toBeNull();

    const migration = readFileSync(
      "supabase/migrations/20260909121000_recommendation_v3_audit_sector_lineage.sql",
      "utf8",
    );
    expect(migration).toContain("add column if not exists sector text");
    expect(migration).toContain("check (sector is null or btrim(sector) <> '') not valid");
    expect(migration.toLowerCase()).not.toContain("update public.analysis_recommendation_v3_audit");
  });

  it("copies arrays so later event mutation cannot mutate the prepared audit row", () => {
    const event = eventFixture();
    const row = toRecommendationV3AuditRow(event);

    event.reasonCodes.push("AFTER_MAPPING");
    event.anomalyCodes.push("AFTER_MAPPING");

    expect(row.reason_codes).not.toContain("AFTER_MAPPING");
    expect(row.anomaly_codes).not.toContain("AFTER_MAPPING");
  });
});
