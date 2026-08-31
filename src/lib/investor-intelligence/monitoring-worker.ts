import { analyzeCompany, searchCompanies } from "@/lib/data/provider";
import { resolveCanonicalCompanySelection } from "@/lib/data/company-search";
import { persistAnalysis } from "@/lib/db/repositories";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AnalysisType, InvestmentProfile } from "@/lib/analysis/types";
import { processPersistedAnalysisIntelligence } from "./service";
import { determineMonitoringRefresh, type MonitoringRefreshDecision } from "./monitoring";

const JOB_KIND = "investor_monitoring_refresh";
const DEFAULT_BATCH_SIZE = 5;
const STALE_LOCK_MINUTES = 30;
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

type MonitoringJobPayload = {
  userId: string;
  ticker: string;
  companyName?: string;
  trigger?: "scheduled" | "manual" | "filing" | "earnings" | "estimate" | "dividend" | "price";
};

type BackgroundJobRow = {
  id: string;
  payload: MonitoringJobPayload;
  attempts: number;
  max_attempts: number;
};

function safeAnalysisType(value: unknown): AnalysisType {
  return value === "numbers" || value === "deep" || value === "research" || value === "summary" ? value : "summary";
}

function safeInvestmentProfile(value: unknown): InvestmentProfile {
  return value === "long_term" || value === "short_term" || value === "growth" || value === "value" || value === "quality" || value === "dividend" || value === "balanced"
    ? value
    : "balanced";
}

function triggerDecision(trigger: MonitoringJobPayload["trigger"], lastAnalysisAt: Date | null): MonitoringRefreshDecision {
  return determineMonitoringRefresh({
    lastAnalysisAt,
    triggers: {
      manual: trigger === "manual",
      newFiling: trigger === "filing",
      newEarnings: trigger === "earnings",
      newEstimate: trigger === "estimate",
      newDividend: trigger === "dividend",
      materialPriceMove: trigger === "price",
      alertDependency: true,
      thesisDependency: true,
    },
  });
}

async function markJobComplete(jobId: string) {
  const supabase = createAdminClient();
  if (!supabase) return;
  await supabase.from("background_jobs").update({
    status: "completed",
    completed_at: new Date().toISOString(),
    locked_at: null,
    last_error: null,
  }).eq("id", jobId);
}

async function markJobFailure(job: BackgroundJobRow, error: string) {
  const supabase = createAdminClient();
  if (!supabase) return { exhausted: true, retryAt: null as string | null };
  const exhausted = job.attempts >= job.max_attempts;
  const retryAt = exhausted
    ? null
    : new Date(Date.now() + Math.min(6, Math.max(1, job.attempts)) * 60 * 60 * 1000).toISOString();
  await supabase.from("background_jobs").update(exhausted ? {
    status: "failed",
    locked_at: null,
    last_error: error.slice(0, 500),
  } : {
    status: "queued",
    locked_at: null,
    last_error: error.slice(0, 500),
    available_at: retryAt,
  }).eq("id", job.id);
  return { exhausted, retryAt };
}

async function latestAnalysisForUserTicker(userId: string, ticker: string) {
  const supabase = createAdminClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from("analyses")
    .select("analysis_type,investment_profile,created_at,company_name")
    .eq("user_id", userId)
    .eq("ticker", ticker)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function advanceMonitoringState(input: {
  userId: string;
  ticker: string;
  status: "NO_NEW_DATA" | "PROVIDER_UNAVAILABLE" | "FAILED";
  reason: string;
  nextCheckAt: string;
  errorClass?: string | null;
}) {
  const supabase = createAdminClient();
  if (!supabase) return;
  const now = new Date().toISOString();
  await supabase.from("monitoring_state").update({
    last_checked_at: now,
    next_check_at: input.nextCheckAt,
    refresh_reason: input.reason,
    status: input.status,
    last_error_class: input.errorClass ?? null,
    updated_at: now,
  }).eq("user_id", input.userId).eq("ticker", input.ticker);
}

async function processMonitoringJob(job: BackgroundJobRow) {
  const payload = job.payload;
  if (!payload?.userId || !payload?.ticker) throw new Error("invalid_monitoring_payload");

  const latest = await latestAnalysisForUserTicker(payload.userId, payload.ticker);
  const lastAnalysisAt = latest?.created_at ? new Date(latest.created_at) : null;
  const decision = triggerDecision(payload.trigger ?? "scheduled", lastAnalysisAt);
  if (!decision.shouldRefresh) {
    await advanceMonitoringState({
      userId: payload.userId,
      ticker: payload.ticker,
      status: "NO_NEW_DATA",
      reason: decision.reason,
      nextCheckAt: new Date(Date.now() + CHECK_INTERVAL_MS).toISOString(),
    });
    await markJobComplete(job.id);
    return { status: "NO_NEW_DATA" as const, ticker: payload.ticker, reason: decision.reason };
  }

  const candidates = await searchCompanies(payload.ticker);
  const resolution = resolveCanonicalCompanySelection({
    ticker: payload.ticker,
    canonicalTicker: payload.ticker,
    name: payload.companyName ?? latest?.company_name ?? payload.ticker,
  }, candidates);
  if (!resolution.ok) throw new Error(`company_resolution_${resolution.reason}`);

  const analysis = await analyzeCompany({
    company: resolution.company,
    analysisType: safeAnalysisType(latest?.analysis_type),
    investmentProfile: safeInvestmentProfile(latest?.investment_profile),
  });
  if (!analysis.ok) throw new Error(`provider_unavailable:${analysis.error}`);

  const persisted = await persistAnalysis({
    userId: payload.userId,
    report: analysis.data,
    rawProviderWarnings: analysis.warnings,
  });
  if (!persisted.ok) throw new Error(`analysis_persistence:${persisted.error}`);
  analysis.data.id = persisted.id;

  const intelligence = await processPersistedAnalysisIntelligence({
    userId: payload.userId,
    report: analysis.data,
    company: resolution.company,
  });
  await markJobComplete(job.id);
  return {
    status: intelligence.status,
    ticker: payload.ticker,
    reason: decision.reason,
    changeCount: intelligence.changeCount,
    alertCount: intelligence.alertCount,
  };
}

export async function recoverStaleInvestorMonitoringJobs() {
  const supabase = createAdminClient();
  if (!supabase) return { ok: false as const, recovered: 0, failed: 0, error: "supabase_not_configured" };
  const staleBefore = new Date(Date.now() - STALE_LOCK_MINUTES * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  const { data: stale, error } = await supabase
    .from("background_jobs")
    .select("id,attempts,max_attempts")
    .eq("kind", JOB_KIND)
    .eq("status", "processing")
    .lt("locked_at", staleBefore)
    .limit(100);
  if (error) return { ok: false as const, recovered: 0, failed: 0, error: error.message };

  let recovered = 0;
  let failed = 0;
  for (const job of stale ?? []) {
    const exhausted = Number(job.attempts ?? 0) >= Number(job.max_attempts ?? 0);
    const { error: updateError } = await supabase.from("background_jobs").update(exhausted ? {
      status: "failed",
      locked_at: null,
      last_error: "stale_monitoring_lock_exhausted",
    } : {
      status: "queued",
      locked_at: null,
      available_at: now,
      last_error: "stale_monitoring_lock_recovered",
    }).eq("id", job.id).eq("status", "processing");
    if (!updateError) {
      if (exhausted) failed += 1;
      else recovered += 1;
    }
  }
  return { ok: true as const, recovered, failed };
}

export async function enqueueDueInvestorMonitoring(limit = 100) {
  const supabase = createAdminClient();
  if (!supabase) return { ok: false as const, queued: 0, error: "supabase_not_configured" };
  const now = new Date().toISOString();
  const { data: due, error } = await supabase
    .from("monitoring_state")
    .select("user_id,ticker,next_check_at")
    .not("next_check_at", "is", null)
    .lte("next_check_at", now)
    .order("next_check_at", { ascending: true })
    .limit(Math.max(1, Math.min(limit, 500)));
  if (error) return { ok: false as const, queued: 0, error: error.message };

  let queued = 0;
  for (const row of due ?? []) {
    const dedupeKey = `${JOB_KIND}:${row.user_id}:${row.ticker}`;
    const { error: insertError } = await supabase.from("background_jobs").insert({
      kind: JOB_KIND,
      status: "queued",
      payload: { userId: row.user_id, ticker: row.ticker, trigger: "scheduled" },
      dedupe_key: dedupeKey,
      available_at: now,
    });
    if (!insertError) queued += 1;
    else if (insertError.code !== "23505") return { ok: false as const, queued, error: insertError.message };
  }
  return { ok: true as const, queued };
}

export async function runInvestorMonitoringWorker(batchSize = DEFAULT_BATCH_SIZE) {
  const supabase = createAdminClient();
  if (!supabase) return { ok: false as const, processed: 0, results: [], error: "supabase_not_configured" };
  const { data, error } = await supabase.rpc("claim_background_jobs", {
    p_kind: JOB_KIND,
    p_limit: Math.max(1, Math.min(batchSize, 25)),
  });
  if (error) return { ok: false as const, processed: 0, results: [], error: error.message };

  const jobs = (data ?? []) as BackgroundJobRow[];
  const results: Array<Record<string, unknown>> = [];
  for (const job of jobs) {
    try {
      results.push(await processMonitoringJob(job));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failure = await markJobFailure(job, message);
      if (job.payload?.userId && job.payload?.ticker) {
        await advanceMonitoringState({
          userId: job.payload.userId,
          ticker: job.payload.ticker,
          status: failure.exhausted ? "FAILED" : "PROVIDER_UNAVAILABLE",
          reason: failure.exhausted ? "monitoring_retry_exhausted" : "monitoring_retry_scheduled",
          nextCheckAt: failure.retryAt ?? new Date(Date.now() + CHECK_INTERVAL_MS).toISOString(),
          errorClass: message.split(":", 1)[0].slice(0, 80),
        });
      }
      results.push({ status: "FAILED", ticker: job.payload?.ticker ?? null, error: message.slice(0, 160) });
    }
  }
  return { ok: true as const, processed: jobs.length, results };
}

export async function runInvestorMonitoringCycle(input?: { enqueueLimit?: number; batchSize?: number }) {
  const recovered = await recoverStaleInvestorMonitoringJobs();
  if (!recovered.ok) return { ok: false as const, recovered, scheduled: null, worker: null };
  const scheduled = await enqueueDueInvestorMonitoring(input?.enqueueLimit ?? 100);
  if (!scheduled.ok) return { ok: false as const, recovered, scheduled, worker: null };
  const worker = await runInvestorMonitoringWorker(input?.batchSize ?? DEFAULT_BATCH_SIZE);
  return { ok: worker.ok, recovered, scheduled, worker };
}
