import { createAdminClient } from "@/lib/supabase/admin";
import type { CompanyMetricSnapshot, Materiality, ThesisStatus } from "./types";
import { buildWeeklyInvestorBrief } from "./weekly-brief";

function weekWindow(now = new Date()) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  return { start, end, startIso: start.toISOString(), endIso: new Date(end.getTime() + 86_400_000 - 1).toISOString() };
}

export async function generateWeeklyBriefForUser(userId: string, now = new Date()) {
  const supabase = createAdminClient();
  if (!supabase) return { ok: false as const, error: "supabase_not_configured" };
  const window = weekWindow(now);

  const [changesResult, thesisResult, alertsResult, snapshotsResult, watchlistResult, portfoliosResult] = await Promise.all([
    supabase.from("material_changes").select("ticker,metric_key,materiality,reasoning,created_at").eq("user_id", userId).gte("created_at", window.startIso).lte("created_at", window.endIso).order("created_at", { ascending: false }),
    supabase.from("investment_theses").select("id,ticker,title,status").eq("user_id", userId).is("archived_at", null),
    supabase.from("alert_events").select("metric_key,payload,triggered_at").eq("user_id", userId).gte("triggered_at", window.startIso).lte("triggered_at", window.endIso).order("triggered_at", { ascending: false }),
    supabase.from("company_metric_snapshots").select("ticker,normalized,captured_at").eq("user_id", userId).order("captured_at", { ascending: false }).limit(250),
    supabase.from("watchlists").select("ticker").eq("user_id", userId),
    supabase.from("portfolios").select("id").eq("user_id", userId),
  ]);

  const thesisIds = (thesisResult.data ?? []).map((row) => row.id);
  const { data: evaluations } = thesisIds.length ? await supabase
    .from("investment_thesis_evaluations")
    .select("thesis_id,new_status,newly_failed,created_at")
    .eq("user_id", userId)
    .in("thesis_id", thesisIds)
    .gte("created_at", window.startIso)
    .lte("created_at", window.endIso)
    .order("created_at", { ascending: false }) : { data: [] };
  const latestEval = new Map<string, { new_status: string; newly_failed: string[] }>();
  for (const row of evaluations ?? []) if (!latestEval.has(row.thesis_id)) latestEval.set(row.thesis_id, { new_status: row.new_status, newly_failed: row.newly_failed ?? [] });

  const portfolioIds = (portfoliosResult.data ?? []).map((row) => row.id);
  const { data: holdings } = portfolioIds.length
    ? await supabase.from("holdings").select("ticker").in("portfolio_id", portfolioIds)
    : { data: [] };

  const latestSnapshots = new Map<string, CompanyMetricSnapshot>();
  for (const row of snapshotsResult.data ?? []) {
    if (!latestSnapshots.has(row.ticker)) latestSnapshots.set(row.ticker, row.normalized as CompanyMetricSnapshot);
  }

  const brief = buildWeeklyInvestorBrief({
    now,
    changes: (changesResult.data ?? []).map((row) => ({
      ticker: row.ticker,
      metricKey: row.metric_key,
      materiality: row.materiality as Materiality,
      reasoning: row.reasoning,
      createdAt: row.created_at,
    })),
    thesisAlerts: (thesisResult.data ?? []).map((row) => {
      const evaluation = latestEval.get(row.id);
      return {
        ticker: row.ticker,
        title: row.title,
        status: (evaluation?.new_status ?? row.status) as ThesisStatus,
        newlyFailed: evaluation?.newly_failed ?? [],
      };
    }),
    alertEvents: (alertsResult.data ?? []).map((row) => {
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      return {
        ticker: typeof payload.ticker === "string" ? payload.ticker : undefined,
        metricKey: row.metric_key,
        reason: typeof payload.reason === "string" ? payload.reason : undefined,
        triggeredAt: row.triggered_at,
      };
    }),
    snapshots: [...latestSnapshots.values()],
    portfolioTickers: [...new Set((holdings ?? []).map((row) => row.ticker))],
    watchlistTickers: [...new Set((watchlistResult.data ?? []).map((row) => row.ticker))],
    screenerMatches: [],
    earnings: [],
    estimateRevisions: [],
    dividendEvents: [],
  });

  const { data, error } = await supabase.from("weekly_briefs").upsert({
    user_id: userId,
    period_start: brief.periodStart,
    period_end: brief.periodEnd,
    content: brief,
    email_delivery_status: "not_requested",
  }, { onConflict: "user_id,period_start,period_end" }).select("id").single();
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, id: data.id as string, brief };
}

export async function generateWeeklyBriefs(now = new Date(), limit = 1000) {
  const supabase = createAdminClient();
  if (!supabase) return { ok: false as const, generated: 0, failed: 0, error: "supabase_not_configured" };
  const [watchlists, portfolios, theses] = await Promise.all([
    supabase.from("watchlists").select("user_id").limit(limit),
    supabase.from("portfolios").select("user_id").limit(limit),
    supabase.from("investment_theses").select("user_id").is("archived_at", null).limit(limit),
  ]);
  const userIds = [...new Set([
    ...(watchlists.data ?? []).map((row) => row.user_id),
    ...(portfolios.data ?? []).map((row) => row.user_id),
    ...(theses.data ?? []).map((row) => row.user_id),
  ].filter((id): id is string => typeof id === "string"))].slice(0, limit);

  let generated = 0;
  let failed = 0;
  for (const userId of userIds) {
    const result = await generateWeeklyBriefForUser(userId, now);
    if (result.ok) generated += 1;
    else failed += 1;
  }
  return { ok: failed === 0, generated, failed };
}
