import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AnalysisReport } from "@/lib/analysis/types";
import type { RecommendationV3ShadowResult } from "@/lib/analysis/recommendation-v3-shadow";
import {
  parseAnalysisAlertPreferencesV3,
  snapshotFromRecommendationV3,
} from "@/lib/db/analysis-alerts-v3";

type EvaluatedShadow = Extract<RecommendationV3ShadowResult, { status: "evaluated" }>;

function shadowFixture(): EvaluatedShadow {
  return {
    status: "evaluated",
    emitted: true,
    coverage: {} as EvaluatedShadow["coverage"],
    integrity: {} as EvaluatedShadow["integrity"],
    decision: {} as EvaluatedShadow["decision"],
    event: {
      event: "stockbox.recommendation_v3_shadow",
      observedAt: "2026-09-05T20:15:00.000Z",
      ticker: "  msft ",
      analysisFingerprint: "fp",
      analysisArchetype: "standard",
      legacyRating: "Strong Buy",
      normalizedLegacyRating: "STRONG_BUY",
      v3Rating: "WAIT",
      changed: true,
      objectiveScore: 61,
      conviction: 48,
      dataQuality: 72,
      modelUncertainty: 52,
      hadPersonalizedScore: true,
      confidenceGatePassed: false,
      confidenceGateHardBlocked: false,
      reasonCodes: [],
      coveragePolicyVersion: "stockbox-coverage-policy-v3.0.0",
      anomalyPolicyVersion: "stockbox-data-anomaly-policy-v3.0.0",
      recommendationPolicyVersion: "stockbox-recommendation-policy-v3.0.0",
      coverageProfile: "standard",
      verifiedCoverage: 0.8,
      retrievalCoverage: 0.9,
      conflictCount: 0,
      stockboxFailureCount: 0,
      sourceUnavailableCount: 0,
      recommendationEligible: true,
      dataIntegrityScore: 90,
      blockingAnomalyCount: 0,
      anomalyCodes: [],
      recommendationIntegrityEligible: true,
      modelVersion: "test",
    },
  };
}

describe("Analysis Alerts V3 persistence contract", () => {
  it("maps the exact objective V3 shadow decision without a personalized score", () => {
    const report = {
      market: { price: 412.5, currency: "usd" },
    } as unknown as AnalysisReport;

    const snapshot = snapshotFromRecommendationV3("analysis-123", report, shadowFixture());

    expect(snapshot).toEqual({
      ticker: "MSFT",
      analysisId: "analysis-123",
      observedAt: "2026-09-05T20:15:00.000Z",
      rating: "WAIT",
      objectiveScore: 61,
      conviction: 48,
      dataQuality: 72,
      price: 412.5,
      currency: "USD",
    });
    expect(Object.keys(snapshot)).not.toContain("personalizedScore");
    expect(Object.keys(snapshot)).not.toContain("userMatchScore");
  });

  it("parses only supported V3 watchlist preferences", () => {
    expect(parseAnalysisAlertPreferencesV3({
      recommendationChanges: false,
      convictionDropMinimum: 12,
      dataQualityDropMinimum: 9,
      priceAbove: 500,
      priceBelow: 300,
      insider: true,
      arbitrary: "ignored",
    })).toEqual({
      recommendationChanges: false,
      convictionDropMinimum: 12,
      dataQualityDropMinimum: 9,
      priceAbove: 500,
      priceBelow: 300,
    });
  });

  it("fails closed on invalid numeric preference values without inventing thresholds", () => {
    expect(parseAnalysisAlertPreferencesV3({
      convictionDropMinimum: -10,
      dataQualityDropMinimum: "bad",
      priceAbove: -1,
      priceBelow: Number.NaN,
    })).toEqual({
      recommendationChanges: undefined,
      convictionDropMinimum: undefined,
      dataQualityDropMinimum: undefined,
      priceAbove: undefined,
      priceBelow: undefined,
    });
  });

  it("keeps alert state private and the commit RPC service-role-only", () => {
    const sql = readFileSync("supabase/migrations/20260905203000_stockbox_alert_state_v3.sql", "utf8");
    expect(sql).toContain("alter table public.stockbox_alert_state_v3 enable row level security");
    expect(sql).toContain("revoke all on table public.stockbox_alert_state_v3 from public, anon, authenticated");
    expect(sql).toContain("grant select, insert, update, delete on table public.stockbox_alert_state_v3 to service_role");
    expect(sql).toContain("revoke all on function public.commit_stockbox_alert_snapshot_v3");
    expect(sql).toContain("to service_role");
  });

  it("uses optimistic previous-analysis matching and blocks stale state replacement", () => {
    const sql = readFileSync("supabase/migrations/20260905203000_stockbox_alert_state_v3.sql", "utf8");
    expect(sql).toContain("for update");
    expect(sql).toContain("v_previous_analysis_id is distinct from p_expected_previous_analysis_id");
    expect(sql).toContain("v_previous_observed_at > v_observed_at");
    expect(sql).toContain("'stale', true");
  });

  it("commits deduplicated events and state inside the same database function", () => {
    const sql = readFileSync("supabase/migrations/20260905203000_stockbox_alert_state_v3.sql", "utf8");
    expect(sql).toContain("insert into public.stockbox_alert_events_v3");
    expect(sql).toContain("on conflict (user_id, dedupe_key) do nothing");
    expect(sql).toContain("insert into public.stockbox_alert_state_v3");
    expect(sql).toContain("on conflict (user_id, ticker) do update");
  });
});
