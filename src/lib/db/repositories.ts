import type { AnalysisReport, BatchQaResult, InvestmentProfile, UiMode } from "@/lib/analysis/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlan, type PlanKey } from "@/lib/billing/plans";
import { hasPaidAccessStatus } from "@/lib/billing/subscriptions";
import { MODEL_VERSION } from "@/lib/analysis/config";

export type EntitlementPlanKey = PlanKey | "affiliate_ambassador";

type AnalysisEntitlementResult = {
  allowed: boolean;
  configured: boolean;
  plan: EntitlementPlanKey;
  reservationId?: string | null;
  usage: { analyses: number; deepAnalyses: number };
  limits: { analyses: number; deepAnalyses: number };
};

export type BatchEntitlementResult = {
  allowed: boolean;
  configured: boolean;
  plan: EntitlementPlanKey;
  rowLimit: number;
};

function fallbackEntitlement(configured: boolean, allowed = false): AnalysisEntitlementResult {
  const plan = getPlan("free");
  return {
    allowed,
    configured,
    plan: plan.key,
    reservationId: null,
    usage: { analyses: 0, deepAnalyses: 0 },
    limits: { analyses: plan.entitlements.monthlyAnalyses, deepAnalyses: plan.entitlements.deepAnalyses },
  };
}

function numberFromJson(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function entitlementFromJson(value: unknown): AnalysisEntitlementResult {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return fallbackEntitlement(false);
  const payload = value as Record<string, unknown>;
  const planKey: EntitlementPlanKey = payload.plan === "affiliate_ambassador"
    ? "affiliate_ambassador"
    : typeof payload.plan === "string" && getPlan(payload.plan as PlanKey).key === payload.plan
      ? payload.plan as PlanKey
      : "free";
  const usage = payload.usage && typeof payload.usage === "object" && !Array.isArray(payload.usage)
    ? payload.usage as Record<string, unknown>
    : {};
  const limits = payload.limits && typeof payload.limits === "object" && !Array.isArray(payload.limits)
    ? payload.limits as Record<string, unknown>
    : {};
  const plan = getPlan(planKey === "affiliate_ambassador" ? "free" : planKey);
  return {
    allowed: payload.allowed === true,
    configured: payload.configured === true,
    plan: planKey,
    reservationId: typeof payload.reservationId === "string" ? payload.reservationId : null,
    usage: {
      analyses: numberFromJson(usage.analyses),
      deepAnalyses: numberFromJson(usage.deepAnalyses),
    },
    limits: {
      analyses: numberFromJson(limits.analyses) || plan.entitlements.monthlyAnalyses,
      deepAnalyses: numberFromJson(limits.deepAnalyses) || plan.entitlements.deepAnalyses,
    },
  };
}

export async function upsertProfile(input: {
  userId: string;
  email?: string | null;
  experience?: string;
  mode?: UiMode;
  investmentProfile?: InvestmentProfile;
}) {
  const supabase = createAdminClient();
  if (!supabase) return { ok: false as const, error: "Supabase admin client is not configured." };

  const { error } = await supabase.from("profiles").upsert({
    id: input.userId,
    email: input.email,
    experience: input.experience,
    ui_mode: input.mode,
    investment_profile: input.investmentProfile,
    updated_at: new Date().toISOString()
  });

  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function persistAnalysis(input: {
  userId: string | null;
  report: AnalysisReport;
  rawProviderWarnings: string[];
}) {
  const supabase = createAdminClient();
  if (!supabase) return { ok: false as const, error: "Supabase admin client is not configured." };

  const { data, error } = await supabase
    .from("analyses")
    .insert({
      user_id: input.userId,
      ticker: input.report.ticker,
      company_name: input.report.companyName,
      analysis_type: input.report.analysisType,
      investment_profile: input.report.investmentProfile,
      score: input.report.score.score,
      personalized_score: input.report.score.personalizedScore,
      confidence: input.report.score.confidence,
      recommendation: input.report.recommendation,
      model_version: input.report.modelVersion ?? MODEL_VERSION,
      report_schema_version: input.report.reportSchemaVersion ?? null,
      analysis_archetype: input.report.analysisArchetype ?? null,
      data_coverage: input.report.dataCoverage ?? null,
      provider_diagnostics: input.report.providerDiagnostics ?? [],
      source_provenance: input.report.engine?.provenance ?? {},
      valuation_method: input.report.engine?.dcf.method ?? null,
      valuation_status: input.report.engine?.dcf.status ?? null,
      report: input.report,
      provider_warnings: input.rawProviderWarnings
    })
    .select("id")
    .single();

  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, id: data.id as string };
}

export async function persistBatchQaResult(result: BatchQaResult) {
  const supabase = createAdminClient();
  if (!supabase) return { ok: false as const, error: "Supabase admin client is not configured." };
  const { error } = await supabase.from("analysis_batch_qa_results").upsert({
    batch_id: result.batchId,
    rerun_key: result.rerunKey,
    model_version: result.modelVersion,
    score_policy_version: result.scorePolicyVersion,
    benchmark_version: result.benchmarkVersion,
    canonical_input_fingerprint: result.canonicalInputFingerprint,
    provider_versions: result.providerVersions,
    analysis_timestamp: result.analysisTimestamp,
    canonical_entity: result.canonicalEntity,
    analysis_archetype: result.archetype,
    data_coverage: result.coverage,
    confidence: result.confidence,
    score: result.score,
    rating: result.rating,
    qa_flags: result.flags,
    updated_at: new Date().toISOString(),
  }, { onConflict: "batch_id,rerun_key,canonical_entity" });
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function getBatchQaResults(batchId: string, rerunKey: string) {
  const supabase = createAdminClient();
  if (!supabase) return { ok: false as const, error: "Supabase admin client is not configured." };
  const { data, error } = await supabase
    .from("analysis_batch_qa_results")
    .select("*")
    .eq("batch_id", batchId)
    .eq("rerun_key", rerunKey)
    .order("canonical_entity", { ascending: true });
  if (error) return { ok: false as const, error: error.message };
  const results: BatchQaResult[] = (data ?? []).map((row) => ({
    batchId: row.batch_id,
    rerunKey: row.rerun_key,
    modelVersion: row.model_version,
    scorePolicyVersion: row.score_policy_version,
    benchmarkVersion: row.benchmark_version,
    canonicalInputFingerprint: row.canonical_input_fingerprint,
    providerVersions: row.provider_versions ?? {},
    analysisTimestamp: row.analysis_timestamp,
    canonicalEntity: row.canonical_entity,
    archetype: row.analysis_archetype as BatchQaResult["archetype"],
    coverage: Number(row.data_coverage),
    confidence: Number(row.confidence),
    score: row.score === null || row.score === undefined ? null : Number(row.score),
    rating: row.rating as BatchQaResult["rating"],
    flags: (row.qa_flags ?? []) as BatchQaResult["flags"],
  }));
  return { ok: true as const, data: results };
}

export async function getUserAnalysisHistory(input: {
  userId: string;
  page?: number;
  pageSize?: number;
}) {
  const supabase = createAdminClient();
  if (!supabase) return { ok: false as const, error: "Supabase admin client is not configured.", data: [], count: 0 };
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const pageSize = Math.min(50, Math.max(1, Math.floor(input.pageSize ?? 20)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await supabase
    .from("analyses")
    .select("id,ticker,company_name,recommendation,score,confidence,created_at", { count: "exact" })
    .eq("user_id", input.userId)
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) return { ok: false as const, error: error.message, data: [], count: 0 };
  return { ok: true as const, data: data ?? [], count: count ?? 0, page, pageSize };
}

export async function getAnalysis(id: string, userId: string) {
  const supabase = createAdminClient();
  if (!supabase) return null;

  const { data } = await supabase.from("analyses").select("*").eq("id", id).eq("user_id", userId).single();
  return data;
}

export async function getSharedAnalysis(token: string) {
  const supabase = createAdminClient();
  if (!supabase) return null;
  const { data: link } = await supabase
    .from("share_links")
    .select("analysis_id, expires_at, revoked_at")
    .eq("token", token)
    .is("revoked_at", null)
    .single();
  if (!link || (link.expires_at && new Date(link.expires_at) < new Date())) return null;
  const { data } = await supabase.from("analyses").select("report").eq("id", link.analysis_id).single();
  return data?.report as AnalysisReport | undefined;
}

export async function recordUsageEvent(input: {
  userId: string | null;
  event: string;
  metadata?: Record<string, unknown>;
}) {
  const supabase = createAdminClient();
  if (!supabase) return;

  await supabase.from("usage_events").insert({
    user_id: input.userId,
    event: input.event,
    metadata: input.metadata ?? {}
  });
}

export async function logApplicationError(input: {
  service: string;
  message: string;
  context?: Record<string, unknown>;
  userId?: string | null;
}) {
  const supabase = createAdminClient();
  if (!supabase) return;

  await supabase.from("error_logs").insert({
    user_id: input.userId ?? null,
    service: input.service,
    sanitized_error: input.message,
    context: input.context ?? {}
  });
}

export async function getBatchEntitlement(input: {
  userId: string;
  isAdmin?: boolean;
  isAffiliateAmbassador?: boolean;
}): Promise<BatchEntitlementResult> {
  if (input.isAdmin) {
    return { allowed: true, configured: true, plan: "elite", rowLimit: 50 };
  }
  if (input.isAffiliateAmbassador) {
    return { allowed: true, configured: true, plan: "affiliate_ambassador", rowLimit: 50 };
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return { allowed: false, configured: false, plan: "free", rowLimit: 0 };
  }

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("plan_key,status")
    .eq("user_id", input.userId)
    .single();
  const active = subscription && hasPaidAccessStatus(subscription.status);
  const plan = getPlan(active ? subscription.plan_key : "free");
  const rowLimit = Math.min(plan.entitlements.batchRows, 50);

  return {
    allowed: rowLimit > 0,
    configured: true,
    plan: plan.key,
    rowLimit,
  };
}

export async function reserveAnalysisEntitlement(input: {
  userId: string;
  analysisType: AnalysisReport["analysisType"];
}): Promise<AnalysisEntitlementResult> {
  const supabase = createAdminClient();
  if (!supabase) return fallbackEntitlement(false);

  const { data, error } = await supabase.rpc("reserve_analysis_entitlement", {
    p_user_id: input.userId,
    p_analysis_type: input.analysisType,
  });

  if (error) return fallbackEntitlement(false);
  return entitlementFromJson(data);
}

export async function completeAnalysisReservation(input: {
  reservationId: string;
  analysisId: string;
}) {
  const supabase = createAdminClient();
  if (!supabase) return;

  await supabase
    .from("analysis_quota_reservations")
    .update({
      status: "completed",
      analysis_id: input.analysisId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.reservationId)
    .eq("status", "reserved");
}

export async function releaseAnalysisReservation(input: {
  reservationId: string;
  status: "released" | "failed";
}) {
  const supabase = createAdminClient();
  if (!supabase) return;

  await supabase
    .from("analysis_quota_reservations")
    .update({
      status: input.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.reservationId)
    .eq("status", "reserved");
}

export async function reserveAdminAlert(report: AnalysisReport) {
  const supabase = createAdminClient();
  if (!supabase) return false;
  const { error } = await supabase.from("admin_alert_deliveries").insert({
    analysis_id: report.id,
    ticker: report.ticker,
    model_version: report.modelVersion ?? MODEL_VERSION,
  });
  return !error;
}

export async function markAdminAlertSent(analysisId: string, providerMessageId?: string) {
  const supabase = createAdminClient();
  if (!supabase) return;
  await supabase.from("admin_alert_deliveries").update({
    sent_at: new Date().toISOString(),
    provider_message_id: providerMessageId ?? null,
  }).eq("analysis_id", analysisId);
}

export async function releaseAdminAlert(analysisId: string) {
  const supabase = createAdminClient();
  if (!supabase) return;
  await supabase.from("admin_alert_deliveries").delete().eq("analysis_id", analysisId).is("sent_at", null);
}
