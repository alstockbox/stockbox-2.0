import type { AnalysisReport, InvestmentProfile, UiMode } from "@/lib/analysis/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlan } from "@/lib/billing/plans";
import { MODEL_VERSION } from "@/lib/analysis/config";

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

export async function checkAnalysisEntitlement(input: { userId: string; analysisType: "summary" | "numbers" | "deep" }) {
  const supabase = createAdminClient();
  if (!supabase) return { allowed: true as const, configured: false as const };

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const [{ data: subscription }, { count: total }, { count: deep }] = await Promise.all([
    supabase.from("subscriptions").select("plan_key,status").eq("user_id", input.userId).single(),
    supabase.from("analyses").select("id", { count: "exact", head: true }).eq("user_id", input.userId).gte("created_at", monthStart.toISOString()),
    supabase.from("analyses").select("id", { count: "exact", head: true }).eq("user_id", input.userId).eq("analysis_type", "deep").gte("created_at", monthStart.toISOString()),
  ]);
  const active = subscription && ["active", "trialing"].includes(subscription.status);
  const plan = getPlan(active ? subscription.plan_key : "free");
  const used = total ?? 0;
  const deepUsed = deep ?? 0;
  const allowed = used < plan.entitlements.monthlyAnalyses && (input.analysisType !== "deep" || deepUsed < plan.entitlements.deepAnalyses);

  return {
    allowed,
    configured: true as const,
    plan: plan.key,
    usage: { analyses: used, deepAnalyses: deepUsed },
    limits: { analyses: plan.entitlements.monthlyAnalyses, deepAnalyses: plan.entitlements.deepAnalyses },
  };
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
