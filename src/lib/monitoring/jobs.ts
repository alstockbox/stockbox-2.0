import { enqueueBackgroundJob, runBackgroundJobs, type BackgroundJob } from "@/lib/jobs/background-jobs";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentOfficialMonitoringCostDecision } from "./cost-policy-v3";
import {
  groupWatchlistRowsByCanonicalTicker,
  runWatchlistRowsMonitoring,
  type MonitoringRunResult,
  type WatchlistRow,
} from "./watchlist-monitor";

export const WATCHLIST_MONITOR_JOB_KIND = "watchlist_monitor";

const watchlistProjection = "id,user_id,ticker,company_name,alert_preferences,monitoring_enabled,monitoring_frequency";

export function watchlistJobDedupeKey(ticker: string): string {
  return `watchlist:${ticker.trim().toUpperCase()}`;
}

export async function enqueueDueWatchlistMonitoringJobs(
  options: { limit?: number; now?: Date } = {},
): Promise<{ queued: number; deduplicated: number; failed: number }> {
  const policy = currentOfficialMonitoringCostDecision();
  if (!policy.allowed) return { queued: 0, deduplicated: 0, failed: 0 };

  const admin = createAdminClient();
  if (!admin) throw new Error("Supabase admin client is unavailable.");
  const now = options.now ?? new Date();
  const limit = Math.max(1, Math.min(options.limit ?? 100, 500));
  const { data, error } = await admin.from("watchlists")
    .select(watchlistProjection)
    .eq("monitoring_enabled", true)
    .lte("next_check_at", now.toISOString())
    .order("next_check_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`Unable to load due watchlist monitors: ${error.message}`);

  let queued = 0;
  let deduplicated = 0;
  let failed = 0;
  for (const group of groupWatchlistRowsByCanonicalTicker((data ?? []) as WatchlistRow[])) {
    const ticker = group[0]?.ticker ?? "";
    const outcome = await enqueueBackgroundJob({
      kind: WATCHLIST_MONITOR_JOB_KIND,
      dedupeKey: watchlistJobDedupeKey(ticker),
      maxAttempts: 4,
      payload: {
        ticker: ticker.trim().toUpperCase(),
        watchlistIds: group.map((row) => row.id),
      },
    });
    if (!outcome.ok) failed += 1;
    else if (outcome.deduplicated) deduplicated += 1;
    else queued += 1;
  }
  return { queued, deduplicated, failed };
}

function watchlistIdsFromJob(job: BackgroundJob): string[] {
  const value = job.payload.watchlistIds;
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === "string" && id.length > 0).slice(0, 500);
}

export async function handleWatchlistMonitoringJob(job: BackgroundJob): Promise<void> {
  const admin = createAdminClient();
  if (!admin) throw new Error("Supabase admin client is unavailable.");
  const ids = watchlistIdsFromJob(job);
  if (!ids.length) return;
  const { data, error } = await admin.from("watchlists")
    .select(watchlistProjection)
    .in("id", ids)
    .eq("monitoring_enabled", true);
  if (error) throw new Error(`Unable to load queued watchlist monitors: ${error.message}`);
  const result = await runWatchlistRowsMonitoring((data ?? []) as WatchlistRow[]);
  if (result.failed > 0 && result.checked === 0) {
    throw new Error("Queued watchlist monitoring failed for every watcher.");
  }
}

export type DurableWatchlistMonitoringResult = MonitoringRunResult & {
  queued: number;
  deduplicated: number;
  jobsClaimed: number;
  pausedReason?: "background_jobs_killed" | "provider_cost_review_required";
};

export async function runDurableWatchlistMonitoring(
  options: { enqueueLimit?: number; workerLimit?: number; now?: Date } = {},
): Promise<DurableWatchlistMonitoringResult> {
  const policy = currentOfficialMonitoringCostDecision();
  if (!policy.allowed) {
    return {
      checked: 0,
      baselined: 0,
      changed: 0,
      notified: 0,
      failed: 0,
      queued: 0,
      deduplicated: 0,
      jobsClaimed: 0,
      pausedReason: policy.reason,
    };
  }

  const queued = await enqueueDueWatchlistMonitoringJobs({
    limit: options.enqueueLimit,
    now: options.now,
  });
  const run = await runBackgroundJobs({
    kinds: [WATCHLIST_MONITOR_JOB_KIND],
    limit: Math.max(1, Math.min(options.workerLimit ?? 20, 50)),
    handlers: { [WATCHLIST_MONITOR_JOB_KIND]: handleWatchlistMonitoringJob },
  });
  return {
    checked: run.completed,
    baselined: 0,
    changed: 0,
    notified: 0,
    failed: queued.failed + run.failed,
    queued: queued.queued,
    deduplicated: queued.deduplicated,
    jobsClaimed: run.claimed,
  };
}
