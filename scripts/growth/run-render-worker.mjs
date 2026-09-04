import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { estimateGenerativeCostSek, generateGenerativeClip } from "./generative-provider.mjs";

const API_URL = process.env.GROWTH_WORKER_API_URL || "";
const API_TOKEN = process.env.GROWTH_RENDER_WORKER_TOKEN || "";
const FOUNDER_VOICE_URL = process.env.GROWTH_VOICE_ENDPOINT || process.env.GROWTH_VOICE_WORKER_URL || "";
const FOUNDER_VOICE_TOKEN = process.env.GROWTH_VOICE_WORKER_TOKEN || "";
const FOUNDER_VOICE_ESTIMATED_SEK = Number(process.env.GROWTH_VOICE_ESTIMATED_SEK_PER_JOB);
const ENGLISH_VOICE_URL = process.env.GROWTH_ENGLISH_VOICE_ENDPOINT || "";
const ENGLISH_VOICE_TOKEN = process.env.GROWTH_ENGLISH_VOICE_TOKEN || "";
const ENGLISH_VOICE_ESTIMATED_SEK = Number(process.env.GROWTH_ENGLISH_VOICE_ESTIMATED_SEK_PER_JOB);
const MAX_JOBS = Math.min(2, Math.max(1, Number(process.env.GROWTH_RENDER_MAX_JOBS || 2)));
const WORKER_ID = `gha-${process.env.GITHUB_RUN_ID || Date.now()}-${process.env.GITHUB_RUN_ATTEMPT || 1}`;

function required(name, value) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function validCost(value) {
  return Number.isFinite(value) && value >= 0;
}

function skipExperiment(reason) {
  const error = new Error(reason);
  error.code = "EXPERIMENT_SKIPPED";
  return error;
}

async function workerApi(payload) {
  const response = await fetch(required("GROWTH_WORKER_API_URL", API_URL), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-stockbox-growth-worker-token": required("GROWTH_RENDER_WORKER_TOKEN", API_TOKEN),
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`worker_api_${response.status}:${data.error || "unknown"}`);
  return data;
}

function run(command, args, capture = false) {
  const result = spawnSync(command, args, {
    encoding: capture ? "utf8" : undefined,
    stdio: capture ? "pipe" : "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${command}_failed_${result.status}:${capture ? String(result.stderr || result.stdout).slice(0, 500) : ""}`);
  }
  return capture ? String(result.stdout || "") : "";
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function safeRuntimePart(value) {
  return String(value || "asset").replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 120) || "asset";
}

async function uploadSigned(target, path, contentType) {
  if (!target?.signed_url || !target?.bucket || !target?.path) throw new Error("missing_signed_upload_target");
  const body = readFileSync(path);
  const response = await fetch(target.signed_url, {
    method: "PUT",
    headers: {
      "content-type": contentType,
      "cache-control": "max-age=3600",
      "x-upsert": "true",
    },
    body,
  });
  if (!response.ok) throw new Error(`signed_upload_${response.status}:${target.bucket}`);
}

function asset(target, localPath, kind, mimeType, extra = {}) {
  return {
    kind,
    bucket: target.bucket,
    storage_path: target.path,
    mime_type: mimeType,
    checksum_sha256: sha256(localPath),
    ...extra,
  };
}

async function authorizeVoiceCost(job, provider, operation, estimatedSek, optional) {
  const idempotencyKey = `voice:${job.id}:${operation}:${job.attempt_count}`;
  const result = await workerApi({
    action: "authorize_cost",
    worker_id: WORKER_ID,
    job_id: job.id,
    content_id: job.content_id,
    provider,
    operation,
    estimated_sek: estimatedSek,
    optional,
    idempotency_key: idempotencyKey,
  });
  return { authorization: result.authorization, idempotencyKey };
}

async function synthesizeVoice(job, outputPath) {
  const spec = job.render_spec || {};

  if (job.language === "sv") {
    required("GROWTH_VOICE_ENDPOINT", FOUNDER_VOICE_URL);
    required("GROWTH_VOICE_WORKER_TOKEN", FOUNDER_VOICE_TOKEN);
    if (!job.voice_reference_url) throw new Error("founder_voice_reference_missing");
    if (!validCost(FOUNDER_VOICE_ESTIMATED_SEK)) {
      throw new Error("GROWTH_VOICE_ESTIMATED_SEK_PER_JOB must be configured");
    }

    const { authorization, idempotencyKey } = await authorizeVoiceCost(
      job,
      "modal_chatterbox",
      "founder_voice_tts",
      FOUNDER_VOICE_ESTIMATED_SEK,
      false,
    );
    if (!authorization?.allowed) {
      const error = new Error(`budget_deferred:${authorization?.reason || "budget"}`);
      error.code = "BUDGET_DEFERRED";
      throw error;
    }

    const response = await fetch(FOUNDER_VOICE_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${FOUNDER_VOICE_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        request_id: job.id,
        text: String(spec.script || "").slice(0, 1500),
        language: "sv",
        voice_mode: spec.voiceMode || "educational",
        reference_audio_url: job.voice_reference_url,
      }),
    });
    if (!response.ok) throw new Error(`founder_voice_worker_${response.status}`);
    writeFileSync(outputPath, Buffer.from(await response.arrayBuffer()));
    return {
      idempotencyKey,
      provider: "modal_chatterbox",
      operation: "founder_voice_tts",
      estimatedSek: FOUNDER_VOICE_ESTIMATED_SEK,
      actualSek: null,
    };
  }

  if (job.language === "en") {
    if (!ENGLISH_VOICE_URL || !ENGLISH_VOICE_TOKEN || !validCost(ENGLISH_VOICE_ESTIMATED_SEK)) {
      throw skipExperiment("english_voice_unavailable_or_unknown_cost");
    }
    if (job.voice_reference_url) throw new Error("english_voice_must_not_receive_founder_reference");

    const { authorization, idempotencyKey } = await authorizeVoiceCost(
      job,
      "generic_english_voice",
      "generic_english_tts",
      ENGLISH_VOICE_ESTIMATED_SEK,
      true,
    );
    if (!authorization?.allowed) throw skipExperiment(`english_voice_budget:${authorization?.reason || "budget"}`);

    const response = await fetch(ENGLISH_VOICE_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${ENGLISH_VOICE_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        request_id: job.id,
        text: String(spec.script || "").slice(0, 1500),
        language: "en",
        voice_mode: "generic_english",
      }),
    });
    if (!response.ok) throw skipExperiment(`english_voice_worker_${response.status}`);
    writeFileSync(outputPath, Buffer.from(await response.arrayBuffer()));
    return {
      idempotencyKey,
      provider: "generic_english_voice",
      operation: "generic_english_tts",
      estimatedSek: ENGLISH_VOICE_ESTIMATED_SEK,
      actualSek: null,
    };
  }

  throw new Error("unsupported_voice_language");
}

function probeGeneratedClip(path, requestedDurationSeconds) {
  const raw = run("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=codec_name,width,height,duration",
    "-of", "json",
    path,
  ], true);
  const data = JSON.parse(raw);
  const stream = data.streams?.[0];
  const duration = Number(stream?.duration || 0);
  if (!stream?.codec_name || Number(stream.width) <= 0 || Number(stream.height) <= 0) {
    throw new Error("generated_scene_not_decodable");
  }
  if (!Number.isFinite(duration) || duration < 1.8 || duration > requestedDurationSeconds + 1) {
    throw new Error("generated_scene_bad_duration");
  }
}

async function addOptionalGeneratedScenes(job, spec, runtimeDir, runtimeRelativeDir) {
  const output = structuredClone(spec);
  const stats = { attempted: 0, generated: 0, fallback: 0, actual_cost_sek: 0 };
  const enabled = job.generative?.enabled === true;
  const unitCost = job.generative?.cost_per_second_sek;

  for (const scene of output.scenes || []) {
    if (scene.kind !== "generated_micro_scene") continue;
    delete scene.visualRef;
    if (!enabled) {
      stats.fallback += 1;
      continue;
    }

    const durationSeconds = Math.max(2, Math.min(5, Math.round((Number(scene.endMs) - Number(scene.startMs)) / 1000)));
    const request = {
      contentId: job.content_id,
      sceneId: scene.id,
      prompt: scene.prompt,
      durationSeconds,
      aspectRatio: "9:16",
    };
    const estimatedCostSek = estimateGenerativeCostSek(request, unitCost);
    if (estimatedCostSek === null) {
      stats.fallback += 1;
      continue;
    }

    stats.attempted += 1;
    const authorization = await workerApi({
      action: "authorize_cost",
      worker_id: WORKER_ID,
      job_id: job.id,
      content_id: job.content_id,
      provider: "generative_video",
      operation: "micro_scene",
      estimated_sek: estimatedCostSek,
      optional: true,
      idempotency_key: `generated:${job.id}:${scene.id}:${job.attempt_count}`,
    });
    if (!authorization.authorization?.allowed) {
      stats.fallback += 1;
      continue;
    }

    try {
      const generated = await generateGenerativeClip({ request });
      const fileName = `generated-${safeRuntimePart(scene.id)}.mp4`;
      const clipPath = resolve(runtimeDir, fileName);
      writeFileSync(clipPath, Buffer.from(generated.bytes));
      probeGeneratedClip(clipPath, durationSeconds);
      scene.visualRef = `${runtimeRelativeDir}/${fileName}`;
      stats.generated += 1;
      stats.actual_cost_sek += Number(generated.actualCostSek || 0);
    } catch {
      stats.fallback += 1;
      delete scene.visualRef;
    }
  }

  return { spec: output, stats };
}

async function renderVideo(job, workdir) {
  const specPath = resolve(workdir, "spec.json");
  const voicePath = resolve(workdir, "voice.wav");
  const videoPath = resolve(workdir, "master.mp4");
  const coverPath = resolve(workdir, "cover.jpg");
  const metadataPath = resolve(workdir, "metadata.json");
  const runtimeRelativeDir = `.growth-runtime/${safeRuntimePart(job.id)}`;
  const runtimeDir = resolve(process.cwd(), "public", runtimeRelativeDir);

  const voiceUsage = await synthesizeVoice(job, voicePath);
  mkdirSync(runtimeDir, { recursive: true });

  try {
    const enhanced = await addOptionalGeneratedScenes(job, job.render_spec, runtimeDir, runtimeRelativeDir);
    writeFileSync(specPath, JSON.stringify(enhanced.spec));

    run("node", ["scripts/growth/render-growth-video.mjs", "--spec", specPath, "--voice", voicePath, "--out", videoPath]);
    const qcRaw = run("node", ["scripts/growth/validate-growth-video.mjs", "--video", videoPath], true).trim();
    const qc = JSON.parse(qcRaw.split("\n").filter(Boolean).at(-1));
    if (qc.passed !== true) throw new Error(`media_qc_failed:${(qc.reasons || []).join(",")}`);

    run("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-ss", "1", "-i", videoPath,
      "-frames:v", "1", "-q:v", "2", coverPath,
    ]);

    writeFileSync(metadataPath, JSON.stringify({
      version: "v3",
      render_job_id: job.id,
      content_id: job.content_id,
      job_kind: "video",
      qc,
      voice_provider: voiceUsage.provider,
      generative: enhanced.stats,
      generated_at: new Date().toISOString(),
    }));

    await uploadSigned(job.uploads.voice_audio, voicePath, "audio/wav");
    await uploadSigned(job.uploads.master_video, videoPath, "video/mp4");
    await uploadSigned(job.uploads.cover, coverPath, "image/jpeg");
    await uploadSigned(job.uploads.metadata, metadataPath, "application/json");

    const durationMs = Math.round(Number(qc.durationSeconds || 0) * 1000);
    return {
      qc,
      usage: [voiceUsage],
      assets: [
        asset(job.uploads.voice_audio, voicePath, "voice_audio", "audio/wav"),
        asset(job.uploads.master_video, videoPath, "master_video", "video/mp4", { width: 1080, height: 1920, duration_ms: durationMs }),
        asset(job.uploads.cover, coverPath, "cover", "image/jpeg", { width: 1080, height: 1920 }),
        asset(job.uploads.metadata, metadataPath, "metadata", "application/json"),
      ],
    };
  } finally {
    rmSync(runtimeDir, { recursive: true, force: true });
  }
}

async function renderCarousel(job, workdir) {
  const specPath = resolve(workdir, "carousel-spec.json");
  const outDir = resolve(workdir, "carousel");
  writeFileSync(specPath, JSON.stringify(job.render_spec));
  run("node", ["scripts/growth/render-growth-carousel.mjs", "--spec", specPath, "--out-dir", outDir]);

  const slides = Array.isArray(job.render_spec?.slides) ? job.render_spec.slides : [];
  if (slides.length !== job.uploads?.slides?.length) throw new Error("carousel_signed_upload_count_mismatch");
  const assets = [];
  for (let index = 0; index < slides.length; index += 1) {
    const local = resolve(outDir, `slide-${String(index + 1).padStart(2, "0")}.png`);
    const target = job.uploads.slides[index];
    run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", local], true);
    await uploadSigned(target, local, "image/png");
    assets.push(asset(target, local, "carousel_slide", "image/png", { width: 1080, height: 1350, metadata: { slide_index: index + 1 } }));
  }

  const coverPath = resolve(outDir, "cover.png");
  const zipPath = resolve(outDir, "carousel.zip");
  const metadataPath = resolve(outDir, "metadata.json");
  await uploadSigned(job.uploads.cover, coverPath, "image/png");
  await uploadSigned(job.uploads.carousel_zip, zipPath, "application/zip");
  await uploadSigned(job.uploads.metadata, metadataPath, "application/json");
  assets.push(asset(job.uploads.cover, coverPath, "cover", "image/png", { width: 1080, height: 1350 }));
  assets.push(asset(job.uploads.carousel_zip, zipPath, "carousel_zip", "application/zip"));
  assets.push(asset(job.uploads.metadata, metadataPath, "metadata", "application/json"));

  return { qc: { passed: true, kind: "carousel", slide_count: slides.length }, assets, usage: [] };
}

async function renderStaticImage(job, workdir) {
  const specPath = resolve(workdir, "static-spec.json");
  const imagePath = resolve(workdir, "static.png");
  const metadataPath = resolve(workdir, "metadata.json");
  writeFileSync(specPath, JSON.stringify(job.render_spec));
  run("node", ["scripts/growth/render-growth-static.mjs", "--spec", specPath, "--out", imagePath]);
  run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", imagePath], true);
  writeFileSync(metadataPath, JSON.stringify({
    version: "v3",
    render_job_id: job.id,
    content_id: job.content_id,
    job_kind: "static_image",
    width: 1080,
    height: 1350,
    generated_at: new Date().toISOString(),
  }));
  await uploadSigned(job.uploads.static_image, imagePath, "image/png");
  await uploadSigned(job.uploads.metadata, metadataPath, "application/json");
  return {
    qc: { passed: true, kind: "static_image", width: 1080, height: 1350 },
    assets: [
      asset(job.uploads.static_image, imagePath, "static_image", "image/png", { width: 1080, height: 1350 }),
      asset(job.uploads.metadata, metadataPath, "metadata", "application/json"),
    ],
    usage: [],
  };
}

async function renderOne(job) {
  const workdir = mkdtempSync(`${tmpdir()}/stockbox-growth-worker-`);
  try {
    const jobKind = job.job_kind || "video";
    const result =
      jobKind === "video"
        ? await renderVideo(job, workdir)
        : jobKind === "carousel"
          ? await renderCarousel(job, workdir)
          : jobKind === "static_image"
            ? await renderStaticImage(job, workdir)
            : (() => { throw new Error("unsupported_job_kind"); })();

    await workerApi({
      action: "complete",
      worker_id: WORKER_ID,
      job_id: job.id,
      qc: result.qc,
      assets: result.assets,
      usage: result.usage || [],
    });
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
}

async function main() {
  let processed = 0;
  for (let index = 0; index < MAX_JOBS; index += 1) {
    const claimed = await workerApi({ action: "claim", worker_id: WORKER_ID });
    const job = claimed.job;
    if (!job) break;

    try {
      await renderOne(job);
      processed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const budgetDeferred = error?.code === "BUDGET_DEFERRED" || message.startsWith("budget_deferred:");
      const experimentSkipped = error?.code === "EXPERIMENT_SKIPPED";
      try {
        await workerApi({
          action: budgetDeferred ? "defer" : "fail",
          worker_id: WORKER_ID,
          job_id: job.id,
          reason: message.slice(0, 900),
          retryable: !budgetDeferred && !experimentSkipped,
        });
      } catch (transitionError) {
        console.error("render_state_transition_failed", transitionError instanceof Error ? transitionError.message : String(transitionError));
      }
      if (experimentSkipped) continue;
      if (!budgetDeferred) throw error;
      break;
    }
  }
  console.log(JSON.stringify({ ok: true, processed }));
}

main().catch((error) => {
  console.error("growth_render_worker_failed", error instanceof Error ? error.message : String(error));
  process.exit(1);
});