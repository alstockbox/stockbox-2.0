// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const WORKER_TOKEN = Deno.env.get("GROWTH_RENDER_WORKER_TOKEN") || "";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function secureEqual(a: string, b: string) {
  if (!a || !b) return false;
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  const l = new Uint8Array(left);
  const r = new Uint8Array(right);
  let diff = 0;
  for (let i = 0; i < l.length; i += 1) diff |= l[i] ^ r[i];
  return diff === 0;
}

async function configValue(key: string) {
  const { data, error } = await supabase.from("acq_config").select("value").eq("key", key).maybeSingle();
  return error ? null : data?.value ?? null;
}

async function configNumber(key: string, fallback: number) {
  const value = Number(await configValue(key));
  return Number.isFinite(value) ? value : fallback;
}

async function configNullableNumber(key: string) {
  const raw = await configValue(key);
  if (raw === null || String(raw).trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

async function configBoolean(key: string, fallback = false) {
  const raw = await configValue(key);
  if (raw === null) return fallback;
  return ["true", "1", "yes", "on"].includes(String(raw).trim().toLowerCase());
}

function compact(value: unknown, max = 220) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function utcDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("invalid_job_created_at");
  return date.toISOString().slice(0, 10);
}

function subtitleChunks(script: string) {
  const words = String(script || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > 72 && current) {
      chunks.push(current);
      current = word;
    } else current = next;
  }
  if (current) chunks.push(current);
  const picked = chunks.slice(0, 6);
  return picked.map((text, index) => {
    const startMs = 1_000 + index * 4_200;
    return { startMs, endMs: Math.min(27_000, startMs + 3_800), text };
  });
}

function buildVideoSpec(row: any) {
  const assetCopy = row.asset_copy || {};
  const title = compact(assetCopy.headline || String(row.caption || "").split("\n")[0] || "Aktieanalys", 120);
  const script = compact(row.script || assetCopy.voiceover || row.caption || title, 1_450);
  const ctaText = compact(row.cta || "Analysera bolaget i StockBox", 160).replace(/https?:\/\/\S+/g, "").trim() || "Analysera bolaget i StockBox";
  return {
    version: "v3",
    contentId: row.content_id,
    renderJobId: `pending:${row.content_id}:video`,
    language: "sv",
    template: "educational_checklist",
    title,
    hook: title,
    script,
    voiceMode: "educational",
    scenes: [
      { id: "hook", kind: "motion_graphic", startMs: 0, endMs: 5_000, headline: title, body: "En snabb StockBox-genomgång." },
      { id: "stockbox", kind: "stockbox_ui", startMs: 5_000, endMs: 15_000, headline: "Se helheten", body: compact(assetCopy.bullets?.[0] || "Jämför nyckeltal, kvalitet och risk i samma analys.", 220) },
      { id: "analysis", kind: "chart", startMs: 15_000, endMs: 20_000, headline: compact(assetCopy.bullets?.[1] || "Titta på utvecklingen", 120), body: compact(assetCopy.bullets?.[2] || "En enskild siffra säger mindre än trenden över tid.", 220) },
      {
        id: "micro",
        kind: "generated_micro_scene",
        startMs: 20_000,
        endMs: 23_000,
        headline: "Sätt siffrorna i sammanhang",
        body: "Visualisera hur flera datapunkter hänger ihop.",
        prompt: `Clean abstract financial analysis visual, vertical 9:16, no text, no logos, concept: ${title}`,
        fallbackKind: "motion_graphic",
        fallbackHeadline: "Sätt siffrorna i sammanhang",
        fallbackBody: "Koppla värdering, lönsamhet, tillväxt och risk till samma helhetsbild.",
      },
      { id: "cta", kind: "cta", startMs: 23_000, endMs: 30_000, headline: "Fördjupa analysen", body: "Samla analysen i StockBox." },
    ],
    subtitles: subtitleChunks(script),
    cta: { text: ctaText, url: row.utm_url || "https://www.getstockbox.app/" },
  };
}

function buildCarouselSpec(row: any) {
  const assetCopy = row.asset_copy || {};
  const sourceSlides = Array.isArray(assetCopy.slides) ? assetCopy.slides.slice(0, 8) : [];
  const slides = (sourceSlides.length >= 3 ? sourceSlides : [
    assetCopy.headline || "Analysera bolaget steg för steg",
    assetCopy.bullets?.[0] || "Börja med lönsamheten.",
    assetCopy.bullets?.[1] || "Kontrollera balansräkningen.",
    assetCopy.bullets?.[2] || "Se utvecklingen över tid.",
    "Samla analysen i StockBox.",
  ]).map((value: string, index: number, all: string[]) => ({
    index: index + 1,
    headline: compact(value, 88),
    body: index === all.length - 1 ? "Analysera bolaget mer strukturerat med StockBox." : compact(assetCopy.bullets?.[index] || "Titta på data i sitt sammanhang, inte som en isolerad siffra.", 210),
    visualKind: index === all.length - 1 ? "cta" : index % 3 === 0 ? "stockbox_ui" : index % 2 === 0 ? "chart" : "metric",
  }));
  return {
    version: "v3",
    contentId: row.content_id,
    title: compact(assetCopy.headline || slides[0]?.headline || "StockBox-analys", 118),
    slides,
    caption: compact(row.caption || "En tydlig checklista för bättre aktieanalys.", 2_000),
    cta: compact(row.cta || "Analysera bolaget i StockBox", 170).replace(/https?:\/\/\S+/g, "").trim(),
  };
}

function buildStaticSpec(row: any) {
  const assetCopy = row.asset_copy || {};
  return {
    version: "v3",
    contentId: row.content_id,
    headline: compact(assetCopy.headline || String(row.caption || "").split("\n")[0] || "Analysera smartare", 100),
    body: compact(assetCopy.bullets?.[0] || row.caption || "StockBox hjälper dig strukturera analysen.", 360),
    cta: compact(row.cta || "Analysera i StockBox", 160).replace(/https?:\/\/\S+/g, "").trim(),
  };
}

function jobKindForPlatform(platform: string) {
  if (["instagram_reel", "facebook_reel", "tiktok", "youtube_short"].includes(platform)) return "video";
  if (platform === "instagram_carousel") return "carousel";
  if (["linkedin", "facebook"].includes(platform)) return "static_image";
  return null;
}

async function handleMaterialize() {
  const { data: queue, error } = await supabase
    .from("acq_distribution_queue")
    .select("id,content_id,platform,caption,script,cta,utm_url,asset_copy,quality_score,daily_rank,generation_version,status")
    .eq("status", "pending_approval")
    .eq("generation_version", "v2")
    .order("daily_rank", { ascending: true, nullsFirst: false })
    .limit(18);
  if (error) throw new Error(`materialize_queue_failed:${error.message}`);

  const { data: profile } = await supabase
    .from("acq_voice_profiles")
    .select("id")
    .eq("language", "sv")
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const unique = new Map<string, any>();
  for (const row of queue || []) {
    const kind = jobKindForPlatform(String(row.platform || ""));
    if (!kind || !row.content_id) continue;
    const key = `${row.content_id}:${kind}`;
    if (!unique.has(key)) unique.set(key, { row, kind });
  }

  let created = 0;
  for (const { row, kind } of unique.values()) {
    const idempotencyKey = `render:v3:${row.content_id}:${kind}`;
    const renderSpec = kind === "video" ? buildVideoSpec(row) : kind === "carousel" ? buildCarouselSpec(row) : buildStaticSpec(row);
    const payload = {
      idempotency_key: idempotencyKey,
      content_id: row.content_id,
      voice_profile_id: kind === "video" ? profile?.id ?? null : null,
      state: "queued",
      template: "educational_checklist",
      language: "sv",
      job_kind: kind,
      render_spec: renderSpec,
      metadata: { source_queue_id: row.id, quality_score: row.quality_score ?? null },
    };
    const { data: inserted, error: insertError } = await supabase
      .from("acq_render_jobs")
      .upsert(payload, { onConflict: "idempotency_key", ignoreDuplicates: true })
      .select("id");
    if (insertError) throw new Error(`materialize_render_job_failed:${insertError.message}`);
    if (inserted?.length) created += 1;
  }

  return json({ materialized: created, candidates: unique.size, founder_voice_active: Boolean(profile?.id) });
}

async function signedUpload(bucket: string, path: string) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path, { upsert: true });
  if (error || !data?.signedUrl || !data?.token) throw new Error(`signed_upload_failed:${bucket}`);
  return { bucket, path: data.path ?? path, signed_url: data.signedUrl, token: data.token };
}

async function deferClaim(jobId: string, workerId: string, reason: string) {
  await supabase.rpc("acq_defer_render_job_v3", {
    p_job_id: jobId,
    p_worker_id: workerId,
    p_reason: reason.slice(0, 1000),
  });
}

async function buildUploads(jobKind: string, prefix: string, renderSpec: any) {
  const metadata = await signedUpload("growth-ready-assets", `${prefix}metadata.json`);
  if (jobKind === "video") {
    return {
      voice_audio: await signedUpload("growth-render-staging", `${prefix}voice.wav`),
      master_video: await signedUpload("growth-ready-assets", `${prefix}master.mp4`),
      cover: await signedUpload("growth-ready-assets", `${prefix}cover.jpg`),
      metadata,
    };
  }
  if (jobKind === "carousel") {
    const slides = Array.isArray(renderSpec?.slides) ? renderSpec.slides : [];
    if (slides.length < 3 || slides.length > 8) throw new Error("invalid_carousel_render_spec");
    const slideUploads = [];
    for (let index = 0; index < slides.length; index += 1) {
      slideUploads.push(await signedUpload("growth-ready-assets", `${prefix}slide-${String(index + 1).padStart(2, "0")}.png`));
    }
    return {
      slides: slideUploads,
      cover: await signedUpload("growth-ready-assets", `${prefix}cover.png`),
      carousel_zip: await signedUpload("growth-ready-assets", `${prefix}carousel.zip`),
      metadata,
    };
  }
  if (jobKind === "static_image") {
    return {
      static_image: await signedUpload("growth-ready-assets", `${prefix}static.png`),
      metadata,
    };
  }
  throw new Error("unsupported_job_kind");
}

async function handleClaim(body: any) {
  const workerId = String(body.worker_id || "").trim().slice(0, 160);
  if (!workerId) return json({ error: "worker_id_required" }, 400);
  const { data: jobs, error } = await supabase.rpc("acq_claim_render_job_v3", { p_worker_id: workerId });
  if (error) throw new Error(`claim_rpc_failed:${error.message}`);
  const job = Array.isArray(jobs) ? jobs[0] : null;
  if (!job) return json({ job: null });

  try {
    const prefix = `${utcDate(job.created_at)}/${job.content_id}/${job.id}/`;
    const ttl = Math.max(60, Math.min(3600, await configNumber("growth_signed_url_ttl_seconds", 600)));
    const jobKind = String(job.job_kind || "video");
    let voiceReference = null;
    if (jobKind === "video" && job.language === "sv") {
      const { data: profile, error: profileError } = await supabase
        .from("acq_voice_profiles")
        .select("id,storage_bucket,storage_path,status,language")
        .eq("id", job.voice_profile_id)
        .maybeSingle();
      if (profileError || !profile || profile.status !== "active" || profile.language !== "sv") throw new Error("active_founder_voice_profile_required");
      const { data: signed, error: signedError } = await supabase.storage.from(profile.storage_bucket).createSignedUrl(profile.storage_path, ttl);
      if (signedError || !signed?.signedUrl) throw new Error("voice_reference_sign_failed");
      voiceReference = signed.signedUrl;
    }

    return json({
      job: {
        id: job.id,
        content_id: job.content_id,
        render_spec: job.render_spec,
        job_kind: jobKind,
        language: job.language,
        template: job.template,
        attempt_count: job.attempt_count,
        voice_reference_url: voiceReference,
        asset_prefix: prefix,
        uploads: await buildUploads(jobKind, prefix, job.render_spec),
        generative: {
          enabled: jobKind === "video" && (await configBoolean("growth_generative_provider_enabled", false)),
          cost_per_second_sek: await configNullableNumber("growth_generative_cost_sek_per_second"),
        },
      },
    });
  } catch (error) {
    await deferClaim(job.id, workerId, error instanceof Error ? error.message : "claim_preparation_failed");
    throw error;
  }
}

async function handleAuthorizeCost(body: any) {
  const jobId = String(body.job_id || "");
  const contentId = body.content_id ? String(body.content_id) : null;
  const provider = String(body.provider || "").trim().slice(0, 120);
  const operation = String(body.operation || "").trim().slice(0, 120);
  const idempotencyKey = String(body.idempotency_key || "").trim().slice(0, 240);
  const estimatedSek = Number(body.estimated_sek);
  if (!jobId || !provider || !operation || !idempotencyKey || !Number.isFinite(estimatedSek) || estimatedSek < 0) return json({ error: "invalid_cost_authorization_request" }, 400);
  const { data, error } = await supabase.rpc("acq_authorize_growth_cost_v3", {
    p_idempotency_key: idempotencyKey,
    p_provider: provider,
    p_operation: operation,
    p_estimated_sek: estimatedSek,
    p_content_id: contentId,
    p_render_job_id: jobId,
    p_optional: body.optional === true,
  });
  if (error) return json({ error: "budget_authorization_failed", detail: error.message }, 409);
  return json({ authorization: data });
}

async function handleComplete(body: any) {
  const jobId = String(body.job_id || "");
  const workerId = String(body.worker_id || "").trim().slice(0, 160);
  if (!jobId || !workerId) return json({ error: "job_id_and_worker_id_required" }, 400);
  if (!body.qc || body.qc.passed !== true) return json({ error: "qc_must_pass" }, 400);
  if (!Array.isArray(body.assets)) return json({ error: "assets_must_be_array" }, 400);
  const { data, error } = await supabase.rpc("acq_complete_render_job_v3", {
    p_job_id: jobId,
    p_worker_id: workerId,
    p_qc_summary: body.qc,
    p_assets: body.assets,
  });
  if (error) return json({ error: "completion_rejected", detail: error.message }, 409);
  return json({ job: data, ready: true });
}

async function handleDefer(body: any) {
  const jobId = String(body.job_id || "");
  const workerId = String(body.worker_id || "").trim().slice(0, 160);
  if (!jobId || !workerId) return json({ error: "job_id_and_worker_id_required" }, 400);
  const { data, error } = await supabase.rpc("acq_defer_render_job_v3", {
    p_job_id: jobId,
    p_worker_id: workerId,
    p_reason: String(body.reason || "deferred").slice(0, 1000),
  });
  if (error) return json({ error: "deferral_rejected", detail: error.message }, 409);
  return json({ job: data });
}

async function handleFail(body: any) {
  const jobId = String(body.job_id || "");
  const workerId = String(body.worker_id || "").trim().slice(0, 160);
  if (!jobId || !workerId) return json({ error: "job_id_and_worker_id_required" }, 400);
  const maxAttempts = Math.max(1, Math.min(10, await configNumber("growth_render_max_attempts", 2)));
  const { data, error } = await supabase.rpc("acq_fail_render_job_v3", {
    p_job_id: jobId,
    p_worker_id: workerId,
    p_reason: String(body.reason || "render_failed").slice(0, 1000),
    p_retryable: body.retryable !== false,
    p_max_attempts: maxAttempts,
  });
  if (error) return json({ error: "failure_transition_rejected", detail: error.message }, 409);
  return json({ job: data });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!SUPABASE_URL || !SERVICE_KEY || !WORKER_TOKEN) return json({ error: "worker_api_not_configured" }, 503);
  const supplied = request.headers.get("x-stockbox-growth-worker-token") || "";
  if (!(await secureEqual(supplied, WORKER_TOKEN))) return json({ error: "unauthorized" }, 401);
  let body: any;
  try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }

  try {
    switch (body?.action) {
      case "materialize": return await handleMaterialize();
      case "claim": return await handleClaim(body);
      case "authorize_cost": return await handleAuthorizeCost(body);
      case "complete": return await handleComplete(body);
      case "defer": return await handleDefer(body);
      case "fail": return await handleFail(body);
      default: return json({ error: "unsupported_action" }, 400);
    }
  } catch (error) {
    console.error("growth_worker_api_error", error instanceof Error ? error.message : String(error));
    return json({ error: "worker_api_internal_error" }, 500);
  }
});
