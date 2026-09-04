// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { scoreStockboxTopic } from "../stockbox-growth-engine/quality.ts";
import {
  aggregateAttributedGrowth,
  describeLearning,
  enqueueV3Renders,
  generateFounderScriptsV3,
} from "../stockbox-growth-engine/v3/orchestration.ts";
import { monthGrowthSpend } from "../stockbox-growth-engine/v3/provider-budget.ts";
import { GROWTH_V3_CANARY_VERSION, parseConfigRows } from "./runtime.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const baseHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function rest(path: string, init: RequestInit = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...baseHeaders, ...(init.headers || {}) },
  });
  const text = await response.text();
  let body: any = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  if (!response.ok) {
    throw new Error(`DB ${response.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
  }
  return body;
}

const select = (table: string, query = "") => rest(`${table}?${query}`, { method: "GET" });
const insert = (table: string, rows: unknown, prefer = "return=representation") => rest(table, {
  method: "POST",
  headers: { Prefer: prefer },
  body: JSON.stringify(rows),
});
const insertIgnore = (table: string, rows: unknown, onConflict: string) => rest(`${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
  method: "POST",
  headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
  body: JSON.stringify(rows),
});

function dayISO(date = new Date()) { return date.toISOString().slice(0, 10); }
function startOfDayISO(date = new Date()) { const d = new Date(date); d.setUTCHours(0, 0, 0, 0); return d.toISOString(); }
function n(value: unknown, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }

async function loadConfig() {
  const rows = await select("acq_config", "select=key,value,value_type");
  return parseConfigRows(rows || []);
}

async function logRun(workflow: string, status: string, recordsProcessed = 0, errors = 0, detail: Record<string, unknown> = {}) {
  try {
    await insert("acq_workflow_runs", [{ workflow, status, records_processed: recordsProcessed, errors, detail }], "return=minimal");
  } catch {
    // Logging must not turn an otherwise safe shadow run into a failed workflow.
  }
}

async function logError(message: unknown, context: Record<string, unknown> = {}) {
  try {
    await insert("acq_errors", [{
      source: "stockbox-growth-engine-v3",
      error_type: "v3_shadow_canary",
      message: String(message).slice(0, 4000),
      context,
    }], "return=minimal");
  } catch {
    // Best-effort diagnostics only.
  }
}

function dbAdapter() {
  return { select, insertIgnore };
}

async function learningStage(cfg: Record<string, any>) {
  const now = new Date();
  const attribution = await aggregateAttributedGrowth({ db: dbAdapter(), now });
  const ids = Object.keys(attribution.byContent);
  const labels: Record<string, string> = {};
  if (ids.length) {
    const rows = await select("acq_content", `select=id,title,topic&id=in.(${ids.map((id) => encodeURIComponent(id)).join(",")})&limit=100`);
    for (const row of rows || []) labels[String(row.id)] = String(row.title || row.topic || row.id);
  }
  const learning = describeLearning({
    byContent: attribution.byContent,
    minSample: n(cfg.growth_v3_min_learning_sample, 12),
    labels,
  });

  const todayStart = encodeURIComponent(startOfDayISO(now));
  const existing = await select(
    "acq_growth_decisions",
    `select=id&created_at=gte.${todayStart}&expected_effect=eq.v3_shadow_learning&limit=1`,
  );
  if (!existing?.length) {
    await insert("acq_growth_decisions", [{
      decision: learning.summary,
      reason: learning.confidence === "low_sample"
        ? "Låg sample: endast försiktig viktjustering; exploration behålls."
        : learning.confidence === "directional"
          ? "Attribuerad kvalificerad trafik ger ett riktmärke, inte ett kausalt bevis."
          : "Ingen attribuerad contenttrafik ännu.",
      supporting_metrics: {
        v3_shadow: true,
        sample: learning.sample,
        confidence: learning.confidence,
        winner_content_id: learning.winnerContentId || null,
        by_content: attribution.byContent,
      },
      confidence: learning.confidence === "directional" ? 0.65 : learning.confidence === "low_sample" ? 0.35 : 0.1,
      expected_effect: "v3_shadow_learning",
    }], "return=minimal");
  }
  await logRun("SB-17-learning-v3", "success", learning.sample, 0, { confidence: learning.confidence, summary: learning.summary });
  return learning;
}

async function renderStage(cfg: Record<string, any>) {
  const monthlySpendSek = await monthGrowthSpend(select);
  const result = await enqueueV3Renders({
    db: dbAdapter(),
    cfg,
    monthlySpendSek,
    scoreTopic: scoreStockboxTopic,
    baseUrl: String(cfg.base_url || "https://www.getstockbox.app"),
  });
  await logRun("SB-15-render-enqueue-v3", "success", result.created, 0, {
    selected: result.selected,
    created: result.created,
    shadow_mode: result.shadowMode,
    capacity: result.capacity,
    skipped_budget: result.skippedBudget,
    skipped_quality: result.skippedQuality,
    monthly_spend_sek: monthlySpendSek,
  });
  return { ...result, monthlySpendSek };
}

async function founderScriptsStage(cfg: Record<string, any>) {
  const monthlySpendSek = await monthGrowthSpend(select);
  const result = await generateFounderScriptsV3({
    db: dbAdapter(),
    cfg,
    monthlySpendSek,
    scoreTopic: scoreStockboxTopic,
    baseUrl: String(cfg.base_url || "https://www.getstockbox.app"),
  });
  await logRun("SB-16-founder-scripts-v3", "success", result.created, 0, result);
  return result;
}

async function statusStage(cfg: Record<string, any>) {
  const [renderJobs, scripts, packages, spend] = await Promise.all([
    select("acq_render_jobs", "select=id,state,language,metadata,created_at&order=created_at.desc&limit=50"),
    select("acq_manual_script_ideas", `select=id,status,suggested_for_date,created_at&suggested_for_date=eq.${dayISO()}&limit=20`),
    select("acq_distribution_packages", "select=id,status,created_at&status=eq.ready&limit=20"),
    monthGrowthSpend(select),
  ]);
  const v3Jobs = (renderJobs || []).filter((row: any) => row?.metadata?.v3_intelligence === true);
  return {
    shadow_mode: cfg.growth_render_shadow_mode !== false,
    monthly_spend_sek: spend,
    budget_target_sek: 50,
    budget_hard_cap_sek: 75,
    recent_v3_render_jobs: v3Jobs.length,
    founder_scripts_today: scripts?.length || 0,
    ready_packages_visible: packages?.length || 0,
  };
}

async function runMode(mode: string, cfg: Record<string, any>) {
  if (mode === "renders") return renderStage(cfg);
  if (mode === "scripts") return founderScriptsStage(cfg);
  if (mode === "learning") return learningStage(cfg);
  if (mode === "status") return statusStage(cfg);
  if (mode === "full") {
    const result: Record<string, unknown> = {};
    result.renders = await renderStage(cfg);
    result.scripts = await founderScriptsStage(cfg);
    result.learning = await learningStage(cfg);
    result.status = await statusStage(cfg);
    return result;
  }
  throw new Error(`Unknown v3 canary mode: ${mode}`);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "content-type,x-stockbox-token",
      },
    });
  }

  try {
    if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: "server_not_configured" }, 500);
    const cfg = await loadConfig();
    const expected = String(cfg.engine_orchestrator_token || "");
    const supplied = req.headers.get("x-stockbox-token") || "";
    if (!expected || supplied !== expected) return json({ error: "unauthorized" }, 401);

    let body: any = {};
    if (req.method !== "GET") {
      try { body = await req.json(); } catch { /* empty body */ }
    }
    const url = new URL(req.url);
    const mode = body.mode || url.searchParams.get("mode") || "full";
    const started = Date.now();
    const result = await runMode(mode, cfg);
    return json({
      ok: true,
      mode,
      duration_ms: Date.now() - started,
      version: GROWTH_V3_CANARY_VERSION,
      result,
    });
  } catch (error) {
    await logError(error?.message || error, { stack: String(error?.stack || "").slice(0, 5000) });
    return json({
      ok: false,
      error: error?.message || String(error),
      version: GROWTH_V3_CANARY_VERSION,
    }, 500);
  }
});
