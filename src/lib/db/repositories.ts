import type { AnalysisReport, BatchQaResult, InvestmentProfile, UiMode } from "@/lib/analysis/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlan, type PlanKey } from "@/lib/billing/plans";
import { MODEL_VERSION } from "@/lib/analysis/config";

type AnalysisEntitlementResult = {
  allowed: boolean;
  configured: boolean;
  plan: PlanKey;
  reservationId?: string | null;
  usage: { analyses: number; deepAnalyses: number };
  limits: { analyses: number; deepAnalyses: number };
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
  const planKey = typeof payload.plan === "string" && getPlan(payload.plan as PlanKey).key === payload.plan
    ? payload.plan as PlanKey
    : "free";
  const usage = payload.usage && typeof payload.usage === "object" && !Array.isArray(payload.usage)
    ? payload.usage as Record<string, unknown>
    : {};
  const limits = payload.limits && typeof payload.limits === "object" && !Array.isArray(payload.limits)
    ? payload.limits as Record<string, unknown>
    : {};
  const plan = getPlan(planKey);
  return {
    allowed: payload.allowed === true,
    configured: payload.configured === true,
    plan: plan.key,
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
    provider_versions: result.providerVersions,
    analysis_timestamp: result.analysisTimestamp,
    canonical_entity: result.canonicalEntity,
    analysis_archetype: result.archetype,
    data_coverage: result.coverage,
    confidence: result.confidence,
    qa_flags: result.flags,
    updated_at: new Date().toISOString(),
  }, { onConflict: "batch_id,rerun_key,canonical_entity" });
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
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

export async function checkAnalysisEntitlement(input: { userId: string; analysisType: AnalysisReport["analysisType"] }) {
  const supabase = createAdminClient();
  if (!supabase) return { allowed: true as const, configured: false as const };

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const [{ data: subscription }, { count: total }, { count: deep }] = await Promise.all([
    supabase.from("subscriptions").select("plan_key,status").eq("user_id", input.userId).single(),
    supabase.from("analyses").select("id", { count: "exact", head: true }).eq("user_id", input.userId).gte("created_at", monthStart.toISOString()),
    supabase.from("analyses").select("id", { count: "exact", head: true }).eq("user_id", input.userId).in("analysis_type", ["deep", "research"]).gte("created_at", monthStart.toISOString()),
  ]);
  const active = subscription && ["active", "trialing"].includes(subscription.status);
  const plan = getPlan(active ? subscription.plan_key : "free");
  const used = total ?? 0;
  const deepUsed = deep ?? 0;
  const usesDeepQuota = input.analysisType === "deep" || input.analysisType === "research";
  const allowed = used < plan.entitlements.monthlyAnalyses && (!usesDeepQuota || deepUsed < plan.entitlements.deepAnalyses);

  return {
    allowed,
    configured: true as const,
    plan: plan.key,
    usage: { analyses: used, deepAnalyses: deepUsed },
    limits: { analyses: plan.entitlements.monthlyAnalyses, deepAnalyses: plan.entitlements.deepAnalyses },
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
