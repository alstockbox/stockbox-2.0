import {
  GROWTH_BUDGET_HARD_CAP_SEK,
  GROWTH_BUDGET_TARGET_SEK,
} from "@/lib/growth/budget-governor";
import { classifyGrowthRun, type GrowthDiagnosticState } from "@/lib/growth/growth-diagnostics";

export type GrowthAdminDataSource = {
  getMetrics(): Promise<any[]>;
  getBudgetRows(): Promise<any[]>;
  getReadyRenderJobs(): Promise<any[]>;
  getContents(): Promise<any[]>;
  getPassedAssets(): Promise<any[]>;
  getReadyPackages(): Promise<any[]>;
  getFounderScripts(): Promise<any[]>;
  getLearningDecisions(): Promise<any[]>;
  getWorkflowRuns(): Promise<any[]>;
  getErrors(): Promise<any[]>;
  getLegacyV2Count(): Promise<number>;
};

export type GrowthPlatformPackage = {
  id: string;
  platform: string;
  title: string | null;
  caption: string | null;
  description: string | null;
  utmUrl: string | null;
  recommendedTime: string | null;
  dailyRank: number | null;
};

export type GrowthReadyVideo = {
  renderJobId: string;
  contentId: string;
  title: string;
  topic: string | null;
  language: "sv" | "en";
  template: string;
  masterAssetId: string;
  coverAssetId: string | null;
  packages: GrowthPlatformPackage[];
};

export type GrowthReadyAsset = {
  assetId: string;
  contentId: string;
  renderJobId: string | null;
  kind: "carousel_zip" | "static_image";
  title: string;
  packages: GrowthPlatformPackage[];
};

export type GrowthFounderScript = {
  id: string;
  hook: string;
  script: string;
  screenDirections: string | null;
  caption: string | null;
  cta: string | null;
  recommendedPlatform: string | null;
  status: string;
  expiresAt: string | null;
};

export type GrowthAdminViewModel = {
  summary: {
    qualifiedVisitorsToday: number | null;
    rolling7d: number | null;
    previous7d: number | null;
    changePct: number | null;
    targetDailyVisitors: number;
    monthlySpendSek: number;
    budgetTargetSek: number;
    budgetHardCapSek: number;
  };
  readyVideos: GrowthReadyVideo[];
  readyAssets: GrowthReadyAsset[];
  founderScripts: GrowthFounderScript[];
  learningBrief: {
    text: string | null;
    reason: string | null;
    confidence: number | null;
    sample: number | null;
  };
  diagnosticsSummary: {
    healthy: number;
    recovered: number;
    actionRequired: number;
    items: Array<{
      workflow: string;
      state: GrowthDiagnosticState;
      founderMessage: string;
      technicalSummary: string;
    }>;
  };
  legacyV2Count: number;
};

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function dateISO(date: Date) {
  return date.toISOString().slice(0, 10);
}

function monthStartISO(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString();
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function packageView(row: any): GrowthPlatformPackage {
  return {
    id: String(row.id),
    platform: String(row.platform || "unknown"),
    title: row.title ? String(row.title) : null,
    caption: row.caption ? String(row.caption) : null,
    description: row.description ? String(row.description) : null,
    utmUrl: row.utm_url ? String(row.utm_url) : null,
    recommendedTime: row.recommended_time ? String(row.recommended_time) : null,
    dailyRank: finite(row.daily_rank),
  };
}

function isReadyPrivateAsset(row: any) {
  return row?.bucket === "growth-ready-assets" && row?.qc_status === "passed";
}

function relatedErrorsForRun(run: any, errors: any[]) {
  const workflow = String(run?.workflow || "").toLowerCase();
  return (errors || []).filter((error) => {
    const source = String(error?.source || "").toLowerCase();
    if (!source) return false;
    if (source === workflow || source.includes(workflow) || workflow.includes(source)) return true;
    if (workflow.includes("sb-13") && source.includes("sb-ai")) return true;
    if (workflow.includes("sb-10") && source.includes("sb-10")) return true;
    if (workflow.includes("render") && (source.includes("render") || source.includes("growth-worker"))) return true;
    return false;
  });
}

export async function loadGrowthAdminData(
  source: GrowthAdminDataSource,
  now = new Date(),
): Promise<GrowthAdminViewModel> {
  const [
    metrics,
    budgetRows,
    renderJobs,
    contents,
    assets,
    packages,
    founderScripts,
    learningDecisions,
    workflowRuns,
    errors,
    legacyV2Count,
  ] = await Promise.all([
    source.getMetrics(),
    source.getBudgetRows(),
    source.getReadyRenderJobs(),
    source.getContents(),
    source.getPassedAssets(),
    source.getReadyPackages(),
    source.getFounderScripts(),
    source.getLearningDecisions(),
    source.getWorkflowRuns(),
    source.getErrors(),
    source.getLegacyV2Count(),
  ]);

  const today = dateISO(now);
  const todaysMetric = (metrics || []).find((row) => row.metric_date === today) ?? null;
  const latestMetric = (metrics || [])[0] ?? null;
  const qualifiedVisitorsToday = finite(todaysMetric?.qualified_unique_visitors);
  const rolling7d = finite(latestMetric?.rolling_7d_avg);

  const previousStart = dateISO(addDays(now, -13));
  const previousEnd = dateISO(addDays(now, -7));
  const previousValues = (metrics || [])
    .filter((row) => row.metric_date >= previousStart && row.metric_date <= previousEnd)
    .map((row) => finite(row.qualified_unique_visitors))
    .filter((value): value is number => value !== null);
  const previous7d = previousValues.length
    ? round(previousValues.reduce((sum, value) => sum + value, 0) / previousValues.length)
    : null;
  const changePct = rolling7d !== null && previous7d !== null && previous7d > 0
    ? round(((rolling7d - previous7d) / previous7d) * 100, 1)
    : null;

  const monthlySpendSek = round((budgetRows || []).reduce((sum, row) => {
    const actual = finite(row.actual_sek);
    const estimated = finite(row.estimated_sek) ?? 0;
    return sum + (actual ?? estimated);
  }, 0), 6);

  const contentById = new Map((contents || []).map((row) => [String(row.id), row] as const));
  const assetsByJob = new Map<string, any[]>();
  for (const asset of assets || []) {
    if (!asset?.render_job_id || !isReadyPrivateAsset(asset)) continue;
    const jobId = String(asset.render_job_id);
    if (!assetsByJob.has(jobId)) assetsByJob.set(jobId, []);
    assetsByJob.get(jobId)!.push(asset);
  }
  const packagesByJob = new Map<string, any[]>();
  const packagesByContent = new Map<string, any[]>();
  for (const pkg of packages || []) {
    if (pkg?.status !== "ready") continue;
    if (pkg.render_job_id) {
      const jobId = String(pkg.render_job_id);
      if (!packagesByJob.has(jobId)) packagesByJob.set(jobId, []);
      packagesByJob.get(jobId)!.push(pkg);
    }
    if (pkg.content_id) {
      const contentId = String(pkg.content_id);
      if (!packagesByContent.has(contentId)) packagesByContent.set(contentId, []);
      packagesByContent.get(contentId)!.push(pkg);
    }
  }

  const readyVideos: GrowthReadyVideo[] = [];
  for (const job of renderJobs || []) {
    if (job?.state !== "ready" || !job?.id || !job?.content_id) continue;
    const jobId = String(job.id);
    const jobAssets = assetsByJob.get(jobId) ?? [];
    const master = jobAssets.find((asset) => asset.kind === "master_video");
    const readyPackages = packagesByJob.get(jobId) ?? [];
    if (!master || readyPackages.length === 0) continue;
    const contentId = String(job.content_id);
    const content = contentById.get(contentId);
    const cover = jobAssets.find((asset) => asset.kind === "cover") ?? null;
    readyVideos.push({
      renderJobId: jobId,
      contentId,
      title: String(content?.title || content?.topic || "StockBox-video"),
      topic: content?.topic ? String(content.topic) : null,
      language: job.language === "en" ? "en" : "sv",
      template: String(job.template || "educational_checklist"),
      masterAssetId: String(master.id),
      coverAssetId: cover?.id ? String(cover.id) : null,
      packages: readyPackages.map(packageView).sort((a, b) => (a.dailyRank ?? 999) - (b.dailyRank ?? 999)),
    });
  }
  readyVideos.sort((a, b) => (a.packages[0]?.dailyRank ?? 999) - (b.packages[0]?.dailyRank ?? 999));

  const readyAssets: GrowthReadyAsset[] = (assets || [])
    .filter((asset) => isReadyPrivateAsset(asset) && (asset.kind === "carousel_zip" || asset.kind === "static_image"))
    .map((asset) => {
      const contentId = String(asset.content_id || "");
      const content = contentById.get(contentId);
      return {
        assetId: String(asset.id),
        contentId,
        renderJobId: asset.render_job_id ? String(asset.render_job_id) : null,
        kind: asset.kind as "carousel_zip" | "static_image",
        title: String(content?.title || content?.topic || "StockBox-asset"),
        packages: (packagesByContent.get(contentId) ?? []).map(packageView),
      };
    })
    .filter((asset) => asset.contentId && asset.packages.length > 0);

  const founderScriptView: GrowthFounderScript[] = (founderScripts || []).map((row) => ({
    id: String(row.id),
    hook: String(row.hook || ""),
    script: String(row.script || ""),
    screenDirections: row.screen_directions ? String(row.screen_directions) : null,
    caption: row.caption ? String(row.caption) : null,
    cta: row.cta ? String(row.cta) : null,
    recommendedPlatform: row.recommended_platform ? String(row.recommended_platform) : null,
    status: String(row.status || "suggested"),
    expiresAt: row.expires_at ? String(row.expires_at) : null,
  }));

  const learning = (learningDecisions || [])[0] ?? null;
  const sample = finite(learning?.supporting_metrics?.sample);

  const diagnosticItems = (workflowRuns || []).map((run) => {
    const classified = classifyGrowthRun({
      run,
      relatedErrors: relatedErrorsForRun(run, errors || []),
    });
    return {
      workflow: String(run.workflow || "growth-workflow"),
      state: classified.state,
      founderMessage: classified.founderMessage,
      technicalSummary: classified.technicalSummary,
    };
  });

  return {
    summary: {
      qualifiedVisitorsToday,
      rolling7d,
      previous7d,
      changePct,
      targetDailyVisitors: 100,
      monthlySpendSek,
      budgetTargetSek: GROWTH_BUDGET_TARGET_SEK,
      budgetHardCapSek: GROWTH_BUDGET_HARD_CAP_SEK,
    },
    readyVideos,
    readyAssets,
    founderScripts: founderScriptView,
    learningBrief: {
      text: learning?.decision ? String(learning.decision) : null,
      reason: learning?.reason ? String(learning.reason) : null,
      confidence: finite(learning?.confidence),
      sample,
    },
    diagnosticsSummary: {
      healthy: diagnosticItems.filter((item) => item.state === "healthy").length,
      recovered: diagnosticItems.filter((item) => item.state === "degraded_recovered").length,
      actionRequired: diagnosticItems.filter((item) => item.state === "action_required").length,
      items: diagnosticItems,
    },
    legacyV2Count: Number.isFinite(legacyV2Count) ? Math.max(0, legacyV2Count) : 0,
  };
}

export function createSupabaseGrowthAdminDataSource(client: any, now = new Date()): GrowthAdminDataSource {
  const startOfMonth = monthStartISO(now);
  const today = dateISO(now);
  const minScriptExpiry = now.toISOString();

  return {
    async getMetrics() {
      const { data, error } = await client
        .from("acq_daily_metrics")
        .select("metric_date,qualified_unique_visitors,rolling_7d_avg,returning_visitors,attribution_rate,by_source")
        .order("metric_date", { ascending: false })
        .limit(14);
      if (error) throw error;
      return data ?? [];
    },
    async getBudgetRows() {
      const { data, error } = await client
        .from("acq_budget_ledger")
        .select("estimated_sek,actual_sek,created_at")
        .gte("created_at", startOfMonth)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
    async getReadyRenderJobs() {
      const { data, error } = await client
        .from("acq_render_jobs")
        .select("id,content_id,state,template,language,metadata,created_at")
        .eq("state", "ready")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
    async getContents() {
      const { data, error } = await client
        .from("acq_content")
        .select("id,title,topic,company,created_at")
        .eq("campaign_id", "auto_growth_v2")
        .order("created_at", { ascending: false })
        .limit(120);
      if (error) throw error;
      return data ?? [];
    },
    async getPassedAssets() {
      const { data, error } = await client
        .from("acq_media_assets")
        .select("id,content_id,render_job_id,kind,bucket,qc_status,created_at")
        .eq("qc_status", "passed")
        .eq("bucket", "growth-ready-assets")
        .order("created_at", { ascending: false })
        .limit(250);
      if (error) throw error;
      return data ?? [];
    },
    async getReadyPackages() {
      const { data, error } = await client
        .from("acq_distribution_packages")
        .select("id,content_id,render_job_id,platform,title,caption,description,utm_url,recommended_time,daily_rank,status,created_at")
        .eq("status", "ready")
        .order("daily_rank", { ascending: true, nullsFirst: false })
        .limit(250);
      if (error) throw error;
      return data ?? [];
    },
    async getFounderScripts() {
      const { data, error } = await client
        .from("acq_manual_script_ideas")
        .select("id,suggested_for_date,hook,script,screen_directions,caption,cta,recommended_platform,status,expires_at,created_at")
        .eq("suggested_for_date", today)
        .in("status", ["suggested", "saved"])
        .or(`expires_at.is.null,expires_at.gte.${minScriptExpiry}`)
        .order("created_at", { ascending: true })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
    async getLearningDecisions() {
      const { data, error } = await client
        .from("acq_growth_decisions")
        .select("decision,reason,supporting_metrics,confidence,expected_effect,created_at")
        .eq("expected_effect", "v3_shadow_learning")
        .order("created_at", { ascending: false })
        .limit(3);
      if (error) throw error;
      return data ?? [];
    },
    async getWorkflowRuns() {
      const since = addDays(now, -1).toISOString();
      const { data, error } = await client
        .from("acq_workflow_runs")
        .select("workflow,status,detail,created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
    async getErrors() {
      const since = addDays(now, -1).toISOString();
      const { data, error } = await client
        .from("acq_errors")
        .select("source,error_type,message,occurred_at")
        .gte("occurred_at", since)
        .order("occurred_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
    async getLegacyV2Count() {
      const { count, error } = await client
        .from("acq_distribution_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending_approval")
        .eq("generation_version", "v2")
        .gte("quality_score", 72);
      if (error) throw error;
      return count ?? 0;
    },
  };
}
