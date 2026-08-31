import { createAdminClient } from "@/lib/supabase/admin";
import type { MaterialChange, ThesisRuleDefinition, ThesisRuleResultStatus, ThesisStatus, CompanyMetricSnapshot } from "./types";
import type { AlertCondition } from "./alerts";

function admin() {
  const client = createAdminClient();
  if (!client) throw new Error("Supabase admin client is not configured for investor intelligence.");
  return client;
}

export type StoredSnapshot = { id: string; snapshot: CompanyMetricSnapshot };

export async function getLatestCompanySnapshot(userId: string, ticker: string): Promise<StoredSnapshot | null> {
  const { data, error } = await admin()
    .from("company_metric_snapshots")
    .select("id,normalized")
    .eq("user_id", userId)
    .eq("ticker", ticker)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`snapshot_lookup:${error.code ?? "unknown"}`);
  if (!data) return null;
  return { id: data.id as string, snapshot: data.normalized as CompanyMetricSnapshot };
}

export async function persistCompanySnapshot(userId: string, snapshot: CompanyMetricSnapshot): Promise<string> {
  const { data, error } = await admin()
    .from("company_metric_snapshots")
    .upsert({
      user_id: userId,
      analysis_id: snapshot.analysisId,
      ticker: snapshot.ticker,
      company_name: snapshot.companyName,
      captured_at: snapshot.capturedAt,
      price: snapshot.price,
      score: snapshot.score,
      personalized_score: snapshot.personalizedScore,
      confidence: snapshot.confidence,
      coverage: snapshot.coverage,
      fair_value: snapshot.fairValue,
      fair_value_upside: snapshot.fairValueUpside,
      pe: snapshot.valuation.pe,
      historical_pe_percentile: snapshot.valuation.historicalPePercentile,
      fcf_yield: snapshot.valuation.fcfYield,
      dividend_yield: snapshot.dividend.yield,
      normalized: snapshot,
    }, { onConflict: "analysis_id" })
    .select("id")
    .single();
  if (error || !data) throw new Error(`snapshot_persist:${error?.code ?? "unknown"}`);
  return data.id as string;
}

export type StoredThesis = {
  id: string;
  status: ThesisStatus;
  rules: ThesisRuleDefinition[];
};

function parseThreshold(value: unknown): number | [number, number] | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value) && value.length === 2 && value.every((item) => typeof item === "number" && Number.isFinite(item))) {
    return [value[0] as number, value[1] as number];
  }
  return null;
}

export async function getActiveThesis(userId: string, ticker: string): Promise<StoredThesis | null> {
  const client = admin();
  const { data: thesis, error } = await client
    .from("investment_theses")
    .select("id,status")
    .eq("user_id", userId)
    .eq("ticker", ticker)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw new Error(`thesis_lookup:${error.code ?? "unknown"}`);
  if (!thesis) return null;

  const { data: rules, error: rulesError } = await client
    .from("investment_thesis_rules")
    .select("id,label,metric_key,operator,threshold,critical,failure_status")
    .eq("user_id", userId)
    .eq("thesis_id", thesis.id)
    .eq("enabled", true)
    .order("created_at", { ascending: true });
  if (rulesError) throw new Error(`thesis_rules_lookup:${rulesError.code ?? "unknown"}`);

  const parsedRules: ThesisRuleDefinition[] = (rules ?? []).flatMap((row) => {
    const threshold = parseThreshold(row.threshold);
    if (threshold === null) return [];
    return [{
      id: row.id as string,
      label: row.label as string,
      metricKey: row.metric_key as string,
      operator: row.operator as ThesisRuleDefinition["operator"],
      threshold,
      critical: row.critical === true,
      failureStatus: row.failure_status as ThesisRuleDefinition["failureStatus"],
    }];
  });

  return { id: thesis.id as string, status: thesis.status as ThesisStatus, rules: parsedRules };
}

export async function getLatestThesisRuleResults(userId: string, thesisId: string): Promise<Record<string, ThesisRuleResultStatus> | undefined> {
  const { data, error } = await admin()
    .from("investment_thesis_evaluations")
    .select("results")
    .eq("user_id", userId)
    .eq("thesis_id", thesisId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`thesis_evaluation_lookup:${error.code ?? "unknown"}`);
  if (!data?.results || typeof data.results !== "object" || Array.isArray(data.results)) return undefined;
  return data.results as Record<string, ThesisRuleResultStatus>;
}

export async function persistThesisEvaluation(input: {
  userId: string;
  thesisId: string;
  analysisId: string;
  snapshotId: string;
  previousStatus: ThesisStatus;
  newStatus: ThesisStatus;
  results: Record<string, ThesisRuleResultStatus>;
  reasoning: string[];
  newlyFailed: string[];
  newlyRecovered: string[];
}) {
  const client = admin();
  const { error } = await client.from("investment_thesis_evaluations").insert({
    user_id: input.userId,
    thesis_id: input.thesisId,
    analysis_id: input.analysisId,
    snapshot_id: input.snapshotId,
    previous_status: input.previousStatus,
    new_status: input.newStatus,
    results: input.results,
    reasoning: input.reasoning,
    newly_failed: input.newlyFailed,
    newly_recovered: input.newlyRecovered,
  });
  if (error) throw new Error(`thesis_evaluation_persist:${error.code ?? "unknown"}`);

  if (input.newStatus !== input.previousStatus) {
    const { error: updateError } = await client
      .from("investment_theses")
      .update({ status: input.newStatus, last_reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", input.thesisId)
      .eq("user_id", input.userId);
    if (updateError) throw new Error(`thesis_status_update:${updateError.code ?? "unknown"}`);
  }
}

export async function persistMaterialChanges(input: {
  userId: string;
  ticker: string;
  previousSnapshotId: string;
  currentSnapshotId: string;
  changes: MaterialChange[];
}) {
  if (!input.changes.length) return;
  const { error } = await admin().from("material_changes").upsert(
    input.changes.map((change) => ({
      user_id: input.userId,
      ticker: input.ticker,
      previous_snapshot_id: input.previousSnapshotId,
      current_snapshot_id: input.currentSnapshotId,
      metric_key: change.metricKey,
      category: change.category,
      previous_value: change.previousValue,
      current_value: change.currentValue,
      absolute_change: change.absoluteChange,
      relative_change: change.relativeChange,
      materiality: change.materiality,
      reasoning: change.reasoning,
    })),
    { onConflict: "current_snapshot_id,metric_key" },
  );
  if (error) throw new Error(`material_changes_persist:${error.code ?? "unknown"}`);
}

export type StoredAlert = {
  id: string;
  kind: string;
  condition: AlertCondition;
};

export async function getEnabledAlerts(userId: string, ticker: string): Promise<StoredAlert[]> {
  const { data, error } = await admin()
    .from("user_alerts")
    .select("id,kind,metric_key,operator,threshold")
    .eq("user_id", userId)
    .eq("ticker", ticker)
    .eq("enabled", true);
  if (error) throw new Error(`alerts_lookup:${error.code ?? "unknown"}`);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    kind: row.kind as string,
    condition: {
      metricKey: row.metric_key as string,
      operator: row.operator as AlertCondition["operator"],
      threshold: Number(row.threshold),
    },
  }));
}

export async function recordTriggeredAlert(input: {
  userId: string;
  alertId: string;
  snapshotId: string;
  eventKey: string;
  ticker: string;
  companyName: string;
  kind: string;
  metricKey: string;
  priorValue: number | null;
  triggerValue: number;
  threshold: number;
  reason: string;
}) {
  const { data, error } = await admin().rpc("record_investment_alert_event", {
    p_user_id: input.userId,
    p_alert_id: input.alertId,
    p_snapshot_id: input.snapshotId,
    p_event_key: input.eventKey,
    p_ticker: input.ticker,
    p_company_name: input.companyName,
    p_kind: input.kind,
    p_metric_key: input.metricKey,
    p_prior_value: input.priorValue,
    p_trigger_value: input.triggerValue,
    p_threshold: input.threshold,
    p_reason: input.reason,
  });
  if (error) throw new Error(`alert_event_persist:${error.code ?? "unknown"}`);
  return data as { inserted?: boolean } | null;
}

export async function updateMonitoringState(input: {
  userId: string;
  ticker: string;
  snapshotId: string;
  status: "SUCCESS" | "PARTIAL" | "NO_NEW_DATA" | "PROVIDER_UNAVAILABLE" | "INSUFFICIENT_DATA" | "FAILED";
  refreshReason: string;
  nextCheckAt: string | null;
  errorClass?: string | null;
}) {
  const now = new Date().toISOString();
  const { error } = await admin().from("monitoring_state").upsert({
    user_id: input.userId,
    ticker: input.ticker,
    last_snapshot_id: input.snapshotId,
    last_checked_at: now,
    last_success_at: input.status === "SUCCESS" || input.status === "PARTIAL" ? now : null,
    next_check_at: input.nextCheckAt,
    refresh_reason: input.refreshReason,
    status: input.status,
    last_error_class: input.errorClass ?? null,
    updated_at: now,
  }, { onConflict: "user_id,ticker" });
  if (error) throw new Error(`monitoring_state_persist:${error.code ?? "unknown"}`);
}
