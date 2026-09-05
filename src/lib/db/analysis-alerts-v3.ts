import type { AnalysisReport } from "@/lib/analysis/types";
import type { RecommendationV3ShadowResult } from "@/lib/analysis/recommendation-v3-shadow";
import {
  deriveAnalysisAlertsV3,
  type AnalysisAlertEventV3,
  type AnalysisAlertPreferencesV3,
  type AnalysisAlertSnapshotV3,
} from "@/lib/alerts/analysis-alerts-v3";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { createAdminClient } from "@/lib/supabase/admin";

type EvaluatedShadow = Extract<RecommendationV3ShadowResult, { status: "evaluated" }>;

type AlertStateRow = {
  source_analysis_id: string;
  rating: AnalysisAlertSnapshotV3["rating"];
  objective_score: number | string | null;
  conviction: number | string;
  data_quality: number | string;
  price: number | string | null;
  currency: string | null;
  observed_at: string;
};

type WatchlistAlertRow = {
  id: string;
  monitoring_enabled: boolean | null;
  alert_preferences: Record<string, unknown> | null;
};

type CommitResult = {
  committed?: boolean;
  conflict?: boolean;
  stale?: boolean;
  insertedEvents?: number;
};

export type RecordAnalysisAlertsV3Input = {
  userId: string;
  analysisId: string;
  report: AnalysisReport;
  shadow: EvaluatedShadow;
};

export type RecordAnalysisAlertsV3Result =
  | { status: "disabled" }
  | { status: "unconfigured" }
  | { status: "baseline"; insertedEvents: 0 }
  | { status: "committed"; insertedEvents: number }
  | { status: "stale" }
  | { status: "conflict" }
  | { status: "failed"; error: string };

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function boundedPositive(value: unknown): number | undefined {
  const numeric = finiteNumber(value);
  return numeric !== null && numeric > 0 ? numeric : undefined;
}

function optionalThreshold(value: unknown): number | null | undefined {
  if (value === null) return null;
  const numeric = finiteNumber(value);
  return numeric !== null && numeric >= 0 ? numeric : undefined;
}

export function parseAnalysisAlertPreferencesV3(
  value: Record<string, unknown> | null | undefined,
): AnalysisAlertPreferencesV3 {
  if (!value) return {};
  return {
    recommendationChanges:
      typeof value.recommendationChanges === "boolean" ? value.recommendationChanges : undefined,
    convictionDropMinimum: boundedPositive(value.convictionDropMinimum),
    dataQualityDropMinimum: boundedPositive(value.dataQualityDropMinimum),
    priceAbove: optionalThreshold(value.priceAbove),
    priceBelow: optionalThreshold(value.priceBelow),
  };
}

export function snapshotFromRecommendationV3(
  analysisId: string,
  report: AnalysisReport,
  shadow: EvaluatedShadow,
): AnalysisAlertSnapshotV3 {
  const price = finiteNumber(report.market?.price);
  return {
    ticker: shadow.event.ticker.trim().toUpperCase(),
    analysisId,
    observedAt: shadow.event.observedAt,
    rating: shadow.event.v3Rating,
    objectiveScore: shadow.event.objectiveScore,
    conviction: shadow.event.conviction,
    dataQuality: shadow.event.dataQuality,
    price: price !== null && price >= 0 ? price : null,
    currency: report.market?.currency?.trim().toUpperCase() || null,
  };
}

function snapshotFromState(ticker: string, row: AlertStateRow): AnalysisAlertSnapshotV3 {
  return {
    ticker,
    analysisId: row.source_analysis_id,
    observedAt: row.observed_at,
    rating: row.rating,
    objectiveScore: finiteNumber(row.objective_score),
    conviction: finiteNumber(row.conviction) ?? 0,
    dataQuality: finiteNumber(row.data_quality) ?? 0,
    price: finiteNumber(row.price),
    currency: row.currency?.trim().toUpperCase() || null,
  };
}

function serializableEvents(events: AnalysisAlertEventV3[]) {
  return events.map((event) => ({
    policyVersion: event.policyVersion,
    kind: event.kind,
    severity: event.severity,
    dedupeKey: event.dedupeKey,
    messageKey: event.messageKey,
    payload: { ...event.payload },
  }));
}

async function loadPreviousState(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  userId: string,
  ticker: string,
): Promise<AlertStateRow | null> {
  const { data, error } = await admin
    .from("stockbox_alert_state_v3")
    .select("source_analysis_id,rating,objective_score,conviction,data_quality,price,currency,observed_at")
    .eq("user_id", userId)
    .eq("ticker", ticker)
    .maybeSingle();
  if (error) throw new Error(`Unable to load StockBox alert state: ${error.message}`);
  return data as AlertStateRow | null;
}

async function loadWatchlistAlertContext(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  userId: string,
  ticker: string,
): Promise<WatchlistAlertRow | null> {
  const { data, error } = await admin
    .from("watchlists")
    .select("id,monitoring_enabled,alert_preferences")
    .eq("user_id", userId)
    .eq("ticker", ticker)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Unable to load watchlist alert context: ${error.message}`);
  return data as WatchlistAlertRow | null;
}

/**
 * Records StockBox 3 objective analysis alerts without invoking any provider or AI.
 *
 * The current V3 decision is the exact shadow decision produced during the same
 * analysis request. State/event commit is optimistic and atomic in Postgres. A
 * concurrent analysis can force one bounded retry rather than allowing an older
 * snapshot to overwrite a newer one.
 */
export async function recordAnalysisAlertsV3ForPersistedAnalysis(
  input: RecordAnalysisAlertsV3Input,
): Promise<RecordAnalysisAlertsV3Result> {
  if (!isFeatureEnabled("alerts")) return { status: "disabled" };
  const admin = createAdminClient();
  if (!admin) return { status: "unconfigured" };

  const current = snapshotFromRecommendationV3(input.analysisId, input.report, input.shadow);
  if (!current.ticker) return { status: "failed", error: "EMPTY_ALERT_TICKER" };

  try {
    const watchlist = await loadWatchlistAlertContext(admin, input.userId, current.ticker);
    const shouldEmit = Boolean(watchlist?.monitoring_enabled !== false && watchlist?.id);
    const preferences = parseAnalysisAlertPreferencesV3(watchlist?.alert_preferences);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const previousRow = await loadPreviousState(admin, input.userId, current.ticker);
      const previous = previousRow ? snapshotFromState(current.ticker, previousRow) : null;
      const events = shouldEmit ? deriveAnalysisAlertsV3(previous, current, preferences) : [];
      const { data, error } = await admin.rpc("commit_stockbox_alert_snapshot_v3", {
        p_user_id: input.userId,
        p_ticker: current.ticker,
        p_expected_previous_analysis_id: previous?.analysisId ?? null,
        p_snapshot: current,
        p_events: serializableEvents(events),
        p_watchlist_id: shouldEmit ? watchlist?.id ?? null : null,
      });
      if (error) return { status: "failed", error: error.message };

      const outcome = (data ?? {}) as CommitResult;
      if (outcome.stale) return { status: "stale" };
      if (outcome.conflict) {
        if (attempt === 0) continue;
        return { status: "conflict" };
      }
      if (!outcome.committed) return { status: "failed", error: "ALERT_COMMIT_NOT_CONFIRMED" };

      const insertedEvents = Math.max(0, Number(outcome.insertedEvents ?? 0) || 0);
      return previous
        ? { status: "committed", insertedEvents }
        : { status: "baseline", insertedEvents: 0 };
    }

    return { status: "conflict" };
  } catch (error) {
    return {
      status: "failed",
      error: error instanceof Error ? error.message : "UNKNOWN_ANALYSIS_ALERT_ERROR",
    };
  }
}
