import { createClient } from "@/lib/supabase/server";
import type { CompanyMetricSnapshot, Materiality, ThesisRuleResultStatus, ThesisStatus } from "./types";

export type WatchlistIntelligenceRow = {
  watchlistId: string;
  ticker: string;
  companyName: string;
  snapshot: CompanyMetricSnapshot | null;
  previousSnapshot: CompanyMetricSnapshot | null;
  thesis: { id: string; title: string; status: ThesisStatus } | null;
  latestChange: {
    metricKey: string;
    materiality: Materiality;
    reasoning: string;
    createdAt: string;
  } | null;
  activeAlertCount: number;
};

export async function getWatchlistIntelligence(): Promise<WatchlistIntelligenceRow[]> {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data: watchlist } = await supabase
    .from("watchlists")
    .select("id,ticker,company_name,created_at")
    .order("created_at", { ascending: false });
  const items = watchlist ?? [];
  if (!items.length) return [];
  const tickers = items.map((item) => item.ticker);

  const [{ data: snapshots }, { data: theses }, { data: changes }, { data: alerts }] = await Promise.all([
    supabase
      .from("company_metric_snapshots")
      .select("ticker,normalized,captured_at")
      .in("ticker", tickers)
      .order("captured_at", { ascending: false })
      .limit(Math.max(50, tickers.length * 3)),
    supabase
      .from("investment_theses")
      .select("id,ticker,title,status")
      .in("ticker", tickers)
      .is("archived_at", null),
    supabase
      .from("material_changes")
      .select("ticker,metric_key,materiality,reasoning,created_at")
      .in("ticker", tickers)
      .in("materiality", ["IMPORTANT", "THESIS_CHANGING"])
      .order("created_at", { ascending: false })
      .limit(Math.max(50, tickers.length * 3)),
    supabase
      .from("user_alerts")
      .select("ticker")
      .in("ticker", tickers)
      .eq("enabled", true),
  ]);

  const snapshotsByTicker = new Map<string, CompanyMetricSnapshot[]>();
  for (const row of snapshots ?? []) {
    const list = snapshotsByTicker.get(row.ticker) ?? [];
    if (list.length < 2) list.push(row.normalized as CompanyMetricSnapshot);
    snapshotsByTicker.set(row.ticker, list);
  }
  const thesisByTicker = new Map((theses ?? []).map((row) => [row.ticker, {
    id: row.id as string,
    title: row.title as string,
    status: row.status as ThesisStatus,
  }]));
  const changeByTicker = new Map<string, WatchlistIntelligenceRow["latestChange"]>();
  for (const row of changes ?? []) {
    if (!changeByTicker.has(row.ticker)) {
      changeByTicker.set(row.ticker, {
        metricKey: row.metric_key as string,
        materiality: row.materiality as Materiality,
        reasoning: row.reasoning as string,
        createdAt: row.created_at as string,
      });
    }
  }
  const alertCount = new Map<string, number>();
  for (const row of alerts ?? []) alertCount.set(row.ticker, (alertCount.get(row.ticker) ?? 0) + 1);

  return items.map((item) => {
    const tickerSnapshots = snapshotsByTicker.get(item.ticker) ?? [];
    return {
      watchlistId: item.id as string,
      ticker: item.ticker as string,
      companyName: item.company_name as string,
      snapshot: tickerSnapshots[0] ?? null,
      previousSnapshot: tickerSnapshots[1] ?? null,
      thesis: thesisByTicker.get(item.ticker) ?? null,
      latestChange: changeByTicker.get(item.ticker) ?? null,
      activeAlertCount: alertCount.get(item.ticker) ?? 0,
    };
  });
}

export type ThesisIndexRow = {
  id: string;
  ticker: string;
  title: string;
  status: ThesisStatus;
  initialThesisDate: string;
  lastReviewedAt: string | null;
  fairValueTarget: number | null;
  preferredBuyPrice: number | null;
};

export async function getInvestmentTheses(): Promise<ThesisIndexRow[]> {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("investment_theses")
    .select("id,ticker,title,status,initial_thesis_date,last_reviewed_at,fair_value_target,preferred_buy_price")
    .is("archived_at", null)
    .order("updated_at", { ascending: false });
  return (data ?? []).map((row) => ({
    id: row.id as string,
    ticker: row.ticker as string,
    title: row.title as string,
    status: row.status as ThesisStatus,
    initialThesisDate: row.initial_thesis_date as string,
    lastReviewedAt: row.last_reviewed_at as string | null,
    fairValueTarget: row.fair_value_target === null ? null : Number(row.fair_value_target),
    preferredBuyPrice: row.preferred_buy_price === null ? null : Number(row.preferred_buy_price),
  }));
}

export async function getInvestmentThesisDetail(ticker: string) {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data: thesis } = await supabase
    .from("investment_theses")
    .select("id,ticker,title,status,initial_thesis_date,last_reviewed_at,notes,fair_value_target,preferred_buy_price,required_margin_of_safety,risk_notes,positive_catalysts,invalidation_conditions,created_at,updated_at")
    .eq("ticker", ticker)
    .is("archived_at", null)
    .maybeSingle();
  if (!thesis) return null;

  const [{ data: rules }, { data: evaluation }, { data: snapshot }] = await Promise.all([
    supabase
      .from("investment_thesis_rules")
      .select("id,label,metric_key,operator,threshold,critical,failure_status,enabled")
      .eq("thesis_id", thesis.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("investment_thesis_evaluations")
      .select("previous_status,new_status,results,reasoning,newly_failed,newly_recovered,created_at")
      .eq("thesis_id", thesis.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("company_metric_snapshots")
      .select("normalized,captured_at")
      .eq("ticker", ticker)
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    thesis: {
      id: thesis.id as string,
      ticker: thesis.ticker as string,
      title: thesis.title as string,
      status: thesis.status as ThesisStatus,
      initialThesisDate: thesis.initial_thesis_date as string,
      lastReviewedAt: thesis.last_reviewed_at as string | null,
      notes: thesis.notes as string | null,
      fairValueTarget: thesis.fair_value_target === null ? null : Number(thesis.fair_value_target),
      preferredBuyPrice: thesis.preferred_buy_price === null ? null : Number(thesis.preferred_buy_price),
      requiredMarginOfSafety: thesis.required_margin_of_safety === null ? null : Number(thesis.required_margin_of_safety),
      riskNotes: thesis.risk_notes as string | null,
      positiveCatalysts: Array.isArray(thesis.positive_catalysts) ? thesis.positive_catalysts.filter((value): value is string => typeof value === "string") : [],
      invalidationConditions: thesis.invalidation_conditions as string | null,
    },
    rules: (rules ?? []).map((row) => ({
      id: row.id as string,
      label: row.label as string,
      metricKey: row.metric_key as string,
      operator: row.operator as string,
      threshold: row.threshold as unknown,
      critical: row.critical === true,
      failureStatus: row.failure_status as string,
      enabled: row.enabled === true,
    })),
    evaluation: evaluation ? {
      previousStatus: evaluation.previous_status as ThesisStatus,
      newStatus: evaluation.new_status as ThesisStatus,
      results: evaluation.results as Record<string, ThesisRuleResultStatus>,
      reasoning: Array.isArray(evaluation.reasoning) ? evaluation.reasoning.filter((value): value is string => typeof value === "string") : [],
      newlyFailed: (evaluation.newly_failed ?? []) as string[],
      newlyRecovered: (evaluation.newly_recovered ?? []) as string[],
      createdAt: evaluation.created_at as string,
    } : null,
    snapshot: snapshot?.normalized ? snapshot.normalized as CompanyMetricSnapshot : null,
  };
}

export async function getAlertsIntelligence(ticker?: string) {
  const supabase = await createClient();
  if (!supabase) return { alerts: [], events: [] };
  let alertsQuery = supabase
    .from("user_alerts")
    .select("id,ticker,kind,metric_key,operator,threshold,enabled,created_at")
    .order("created_at", { ascending: false });
  let eventsQuery = supabase
    .from("alert_events")
    .select("id,alert_id,metric_key,prior_value,trigger_value,threshold,payload,status,triggered_at,acknowledged_at")
    .order("triggered_at", { ascending: false })
    .limit(50);
  if (ticker) alertsQuery = alertsQuery.eq("ticker", ticker);
  const [{ data: alerts }, { data: events }] = await Promise.all([alertsQuery, eventsQuery]);
  return {
    alerts: (alerts ?? []).map((row) => ({
      id: row.id as string,
      ticker: row.ticker as string,
      kind: row.kind as string,
      metricKey: row.metric_key as string,
      operator: row.operator as string,
      threshold: Number(row.threshold),
      enabled: row.enabled === true,
      createdAt: row.created_at as string,
    })),
    events: (events ?? []).map((row) => ({
      id: row.id as string,
      alertId: row.alert_id as string,
      metricKey: row.metric_key as string,
      priorValue: row.prior_value === null ? null : Number(row.prior_value),
      triggerValue: row.trigger_value === null ? null : Number(row.trigger_value),
      threshold: row.threshold === null ? null : Number(row.threshold),
      payload: (row.payload ?? {}) as Record<string, unknown>,
      status: row.status as string,
      triggeredAt: row.triggered_at as string,
      acknowledgedAt: row.acknowledged_at as string | null,
    })),
  };
}

export async function getDashboardIntelligence(userId: string) {
  const supabase = await createClient();
  if (!supabase) return { lastVisit: null, changes: [], theses: [], alerts: [], snapshots: [] };
  const { data: state } = await supabase
    .from("investor_user_state")
    .select("last_dashboard_visit_at")
    .eq("user_id", userId)
    .maybeSingle();
  const lastVisit = (state?.last_dashboard_visit_at as string | null | undefined) ?? null;

  let changesQuery = supabase
    .from("material_changes")
    .select("id,ticker,metric_key,materiality,previous_value,current_value,reasoning,created_at")
    .in("materiality", ["IMPORTANT", "THESIS_CHANGING"])
    .order("created_at", { ascending: false })
    .limit(30);
  if (lastVisit) changesQuery = changesQuery.gt("created_at", lastVisit);

  const [{ data: changes }, { data: theses }, { data: events }, { data: snapshots }] = await Promise.all([
    changesQuery,
    supabase
      .from("investment_theses")
      .select("id,ticker,title,status,last_reviewed_at")
      .in("status", ["WATCH", "WEAKENING", "BROKEN"])
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(12),
    supabase
      .from("alert_events")
      .select("id,metric_key,payload,status,triggered_at")
      .eq("status", "triggered")
      .order("triggered_at", { ascending: false })
      .limit(12),
    supabase
      .from("company_metric_snapshots")
      .select("ticker,company_name,normalized,captured_at")
      .order("captured_at", { ascending: false })
      .limit(100),
  ]);

  const latestByTicker = new Map<string, CompanyMetricSnapshot>();
  for (const row of snapshots ?? []) {
    if (!latestByTicker.has(row.ticker)) latestByTicker.set(row.ticker, row.normalized as CompanyMetricSnapshot);
  }
  return {
    lastVisit,
    changes: (changes ?? []).map((row) => ({
      id: row.id as string,
      ticker: row.ticker as string,
      metricKey: row.metric_key as string,
      materiality: row.materiality as Materiality,
      previousValue: row.previous_value === null ? null : Number(row.previous_value),
      currentValue: row.current_value === null ? null : Number(row.current_value),
      reasoning: row.reasoning as string,
      createdAt: row.created_at as string,
    })),
    theses: (theses ?? []).map((row) => ({
      id: row.id as string,
      ticker: row.ticker as string,
      title: row.title as string,
      status: row.status as ThesisStatus,
      lastReviewedAt: row.last_reviewed_at as string | null,
    })),
    alerts: (events ?? []).map((row) => ({
      id: row.id as string,
      metricKey: row.metric_key as string,
      payload: (row.payload ?? {}) as Record<string, unknown>,
      status: row.status as string,
      triggeredAt: row.triggered_at as string,
    })),
    snapshots: [...latestByTicker.values()],
  };
}
