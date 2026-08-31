import { analyzeCompany, searchCompanies } from "@/lib/data/provider";
import { resolveCanonicalCompanySelection } from "@/lib/data/company-search";
import { persistAnalysis } from "@/lib/db/repositories";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AnalysisType, InvestmentProfile } from "@/lib/analysis/types";
import { processPersistedAnalysisIntelligence } from "./service";
import { determineMonitoringRefresh, type MonitoringRefreshDecision } from "./monitoring";

const JOB_KIND = "investor_monitoring_refresh";
const DEFAULT_BATCH_SIZE = 5;

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
  if (!supabase) return;
  const exhausted = job.attempts >= job.max_attempts;
  await supabase.from("background_jobs").update(exhausted ? {
    status: "failed",
    locked_at: null,
    last_error: error.slice(0, 500),
  } : {
    status: "queued",
    locked_at: null,
    last_error: error.slice(0, 500),
    available_at: new Date(Date.now() + Math.min(6, Math.max(1, job.attempts)) * 60 * 60 * 1000).toISOString(),
  }).eq("id", job.id);
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

async function processMonitoringJob(job: BackgroundJobRow) {
  const payload = job.payload;
  if (!payload?.userId || !payload?.ticker) throw new Error("invalid_monitoring_payload");

  const latest = await latestAnalysisForUserTicker(payload.userId, payload.ticker);
  const lastAnalysisAt = latest?.created_at ? new Date(latest.created_at) : null;
  const decision = triggerDecision(payload.trigger ?? "scheduled", lastAnalysisAt);
  if (!decision.shouldRefresh) {
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

export async function enqueueDueInvestorMonitoring(limit = 100) {
  const supabase = createAdminClient();
  if (!supabase) return { ok: false as const, queued: 0, error: "supabase_not_configured" };
  const now = new Date().toISOString();
  const { data: due, error } = await supabase
    .from("monitoring_state")
    .select("user_id,ticker,next_check_at")
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
      await markJobFailure(job, message);
      results.push({ status: "FAILED", ticker: job.payload?.ticker ?? null, error: message.slice(0, 160) });
    }
  }
  return { ok: true as const, processed: jobs.length, results };
}

export async function runInvestorMonitoringCycle(input?: { enqueueLimit?: number; batchSize?: number }) {
  const scheduled = await enqueueDueInvestorMonitoring(input?.enqueueLimit ?? 100);
  if (!scheduled.ok) return { ok: false as const, scheduled, worker: null };
  const worker = await runInvestorMonitoringWorker(input?.batchSize ?? DEFAULT_BATCH_SIZE);
  return { ok: worker.ok, scheduled, worker };
}
